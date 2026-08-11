// Exercises the hermes_napi_host implementation (HermesNapiHost.cpp) from the
// Hermes side of the contract: the tests stand in for the calls Hermes' NAPI
// makes through the struct (napi_queue_async_work -> post_work,
// napi_cancel_async_work -> cancel_work, tsfn dispatch -> post_task), with a
// manually drained queue standing in for the CallInvoker-backed JS thread.
#include <catch2/catch_test_macros.hpp>

#include <HermesNapiHost.hpp>

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <deque>
#include <functional>
#include <mutex>
#include <thread>
#include <vector>

using namespace callstack::react_native_node_api;
using namespace std::chrono_literals;

namespace {

// Stands in for the JS thread: functions are queued by the dispatcher (from
// any thread) and only run when the test drains the queue.
struct FakeJsQueue {
  HostContext::JsDispatcher dispatcher() {
    return [this](std::function<void()> &&fn) {
      {
        std::lock_guard lock(mutex_);
        queue_.push_back(std::move(fn));
      }
      cv_.notify_all();
    };
  }

  // Runs queued functions one at a time until the queue is empty, including
  // functions queued reentrantly while draining. Returns how many ran.
  size_t drain() {
    size_t count = 0;
    for (;;) {
      std::function<void()> fn;
      {
        std::lock_guard lock(mutex_);
        if (queue_.empty()) {
          return count;
        }
        fn = std::move(queue_.front());
        queue_.pop_front();
      }
      fn();
      count++;
    }
  }

  bool waitForItems(size_t count, std::chrono::milliseconds timeout = 5s) {
    std::unique_lock lock(mutex_);
    return cv_.wait_for(lock, timeout,
                        [&] { return queue_.size() >= count; });
  }

  size_t size() {
    std::lock_guard lock(mutex_);
    return queue_.size();
  }

private:
  std::mutex mutex_;
  std::condition_variable cv_;
  std::deque<std::function<void()>> queue_;
};

// A work payload whose execute blocks until the gate opens, for holding
// worker threads busy or keeping an item observably "running".
struct GatedWork {
  std::mutex mutex;
  std::condition_variable cv;
  bool open = false;
  std::atomic<int> started{0};
  std::atomic<int> completions{0};
  std::atomic<int> executions{0};
  napi_status lastStatus = napi_ok;

  static void execute(void *data) {
    auto *self = static_cast<GatedWork *>(data);
    self->executions++;
    self->started++;
    std::unique_lock lock(self->mutex);
    self->cv.wait(lock, [self] { return self->open; });
  }

  static void complete(void *data, napi_status status) {
    auto *self = static_cast<GatedWork *>(data);
    self->lastStatus = status;
    self->completions++;
  }

  void openGate() {
    {
      std::lock_guard lock(mutex);
      open = true;
    }
    cv.notify_all();
  }

  void waitForStarted(int count) {
    while (started.load() < count) {
      std::this_thread::sleep_for(1ms);
    }
  }
};

// Matches WorkerPool::kThreadCount in HermesNapiHost.cpp; saturating all
// workers keeps a subsequently posted item deterministically queued.
constexpr int kWorkerCount = 4;

} // namespace

TEST_CASE("post_work runs execute off the posting thread and delivers "
          "complete(napi_ok) through the dispatcher") {
  FakeJsQueue js;
  auto context = HostContext::create(js.dispatcher());
  hermes_napi_host *host = context->host();

  struct Work {
    std::thread::id executeThread{};
    std::atomic<bool> executed{false};
    std::atomic<int> completions{0};
    napi_status status = napi_cancelled;
  } work;

  host->post_work(
      host->data, &work,
      [](void *data) {
        auto *w = static_cast<Work *>(data);
        w->executeThread = std::this_thread::get_id();
        w->executed = true;
      },
      [](void *data, napi_status status) {
        auto *w = static_cast<Work *>(data);
        w->status = status;
        w->completions++;
      });

  // The completion is posted to the JS queue once execute finished on a
  // worker thread — and must not have run inline.
  REQUIRE(js.waitForItems(1));
  REQUIRE(work.executed.load());
  REQUIRE(work.executeThread != std::this_thread::get_id());
  REQUIRE(work.completions.load() == 0);
  REQUIRE(js.drain() == 1);
  REQUIRE(work.completions.load() == 1);
  REQUIRE(work.status == napi_ok);
}

TEST_CASE("cancel_work cancels queued items and rejects started items") {
  FakeJsQueue js;
  auto context = HostContext::create(js.dispatcher());
  hermes_napi_host *host = context->host();

  SECTION("a queued item is cancelled: execute skipped, complete gets "
          "napi_cancelled, a second cancel fails") {
    auto *busy = new GatedWork();
    for (int i = 0; i < kWorkerCount; i++) {
      host->post_work(host->data, busy, GatedWork::execute,
                      GatedWork::complete);
    }
    busy->waitForStarted(kWorkerCount);

    // Every worker is blocked on the gate, so this item stays queued.
    auto *target = new GatedWork();
    host->post_work(host->data, target, GatedWork::execute,
                    GatedWork::complete);
    REQUIRE(host->cancel_work(host->data, target));
    // Cancelling the same item again fails: it is no longer queued.
    REQUIRE(!host->cancel_work(host->data, target));

    REQUIRE(js.waitForItems(1));
    REQUIRE(js.drain() == 1);
    REQUIRE(target->completions.load() == 1);
    REQUIRE(target->lastStatus == napi_cancelled);
    REQUIRE(target->executions.load() == 0);

    busy->openGate();
    REQUIRE(js.waitForItems(kWorkerCount));
    REQUIRE(js.drain() == kWorkerCount);
    REQUIRE(busy->completions.load() == kWorkerCount);
    delete busy;
    delete target;
  }

  SECTION("an item that started executing cannot be cancelled") {
    auto *target = new GatedWork();
    host->post_work(host->data, target, GatedWork::execute,
                    GatedWork::complete);
    target->waitForStarted(1);
    REQUIRE(!host->cancel_work(host->data, target));
    target->openGate();
    REQUIRE(js.waitForItems(1));
    REQUIRE(js.drain() == 1);
    REQUIRE(target->completions.load() == 1);
    REQUIRE(target->lastStatus == napi_ok);
    REQUIRE(target->executions.load() == 1);
    delete target;
  }
}

TEST_CASE("cancel_work racing worker pickup yields exactly one outcome") {
  FakeJsQueue js;
  auto context = HostContext::create(js.dispatcher());
  hermes_napi_host *host = context->host();

  struct Work {
    std::atomic<int> executions{0};
    std::atomic<int> completions{0};
    std::atomic<napi_status> status{napi_generic_failure};
  };

  for (int i = 0; i < 200; i++) {
    Work work;
    host->post_work(
        host->data, &work,
        [](void *data) { static_cast<Work *>(data)->executions++; },
        [](void *data, napi_status status) {
          auto *w = static_cast<Work *>(data);
          w->status = status;
          w->completions++;
        });
    bool cancelled = host->cancel_work(host->data, &work);

    // Exactly one completion arrives either way...
    REQUIRE(js.waitForItems(1));
    REQUIRE(js.drain() == 1);
    REQUIRE(work.completions.load() == 1);
    // ...and it matches whether execute ran: cancelled XOR executed.
    if (cancelled) {
      REQUIRE(work.executions.load() == 0);
      REQUIRE(work.status.load() == napi_cancelled);
    } else {
      REQUIRE(work.executions.load() == 1);
      REQUIRE(work.status.load() == napi_ok);
    }
  }
}

TEST_CASE("post_task delivers exactly once, in order and never inline") {
  FakeJsQueue js;
  auto context = HostContext::create(js.dispatcher());
  hermes_napi_host *host = context->host();

  SECTION("a task posted from the current thread does not run inline") {
    std::atomic<int> runs{0};
    auto callback = [](void *data) {
      static_cast<std::atomic<int> *>(data)->fetch_add(1);
    };
    host->post_task(host->data, &runs, callback);
    REQUIRE(runs.load() == 0);
    REQUIRE(js.drain() == 1);
    REQUIRE(runs.load() == 1);
  }

  SECTION("tasks are delivered in posting order") {
    std::vector<int> order;
    struct Task {
      std::vector<int> *order;
      int value;
    };
    std::vector<Task> tasks;
    for (int i = 0; i < 10; i++) {
      tasks.push_back(Task{&order, i});
    }
    for (auto &task : tasks) {
      host->post_task(host->data, &task, [](void *data) {
        auto *t = static_cast<Task *>(data);
        t->order->push_back(t->value);
      });
    }
    REQUIRE(js.drain() == 10);
    REQUIRE(order == std::vector<int>{0, 1, 2, 3, 4, 5, 6, 7, 8, 9});
  }

  SECTION("tasks posted concurrently from many threads are all delivered") {
    constexpr int kThreads = 8;
    constexpr int kPostsPerThread = 100;
    std::atomic<int> runs{0};
    std::vector<std::thread> producers;
    for (int i = 0; i < kThreads; i++) {
      producers.emplace_back([&] {
        for (int j = 0; j < kPostsPerThread; j++) {
          host->post_task(host->data, &runs, [](void *data) {
            static_cast<std::atomic<int> *>(data)->fetch_add(1);
          });
        }
      });
    }
    for (auto &producer : producers) {
      producer.join();
    }
    REQUIRE(js.drain() == kThreads * kPostsPerThread);
    REQUIRE(runs.load() == kThreads * kPostsPerThread);
  }

  SECTION("a task can repost itself from inside its own callback, as Hermes' "
          "tsfn dispatch does") {
    struct Repost {
      hermes_napi_host *host;
      std::atomic<int> runs{0};

      static void callback(void *data) {
        auto *self = static_cast<Repost *>(data);
        if (self->runs.fetch_add(1) + 1 < 5) {
          self->host->post_task(self->host->data, self, &Repost::callback);
        }
      }
    } repost{host, {}};
    host->post_task(host->data, &repost, &Repost::callback);
    // The drain loop keeps going until reposted tasks stop arriving.
    REQUIRE(js.drain() == 5);
    REQUIRE(repost.runs.load() == 5);
  }
}

TEST_CASE("work completing after its context died is dropped, not crashed") {
  FakeJsQueue js;
  auto context = HostContext::create(js.dispatcher());
  hermes_napi_host *host = context->host();

  // Leaked deliberately: complete never runs, so nothing would free it, and
  // the worker may still be inside execute when the assertions run.
  auto *work = new GatedWork();
  host->post_work(host->data, work, GatedWork::execute, GatedWork::complete);
  work->waitForStarted(1);

  // Simulates a React Native runtime teardown: in production the context is
  // retained for the process lifetime, but the dispatcher's CallInvoker —
  // modelled here by the context itself — can die while work is in flight.
  context.reset();
  work->openGate();

  // The completion cannot be delivered anywhere; give the worker a moment to
  // hit the drop path and assert nothing was queued and nothing crashed.
  std::this_thread::sleep_for(100ms);
  REQUIRE(js.size() == 0);
  REQUIRE(work->completions.load() == 0);
}
