// Skipped on Windows, which has no fork().
#if !defined(_WIN32)

#include <catch2/catch_test_macros.hpp>

#include <HermesFatalHandler.hpp>

#include <csignal>
#include <cstdio>
#include <string>

#include <sys/wait.h>
#include <unistd.h>

using namespace callstack::react_native_node_api;

TEST_CASE("handleHermesFatal logs the reason, then aborts") {
  // Printf conversions must reach the log verbatim, not be interpreted.
  const std::string reason = "FATAL ERROR: some_location 100% %s %n";

  int pipeFds[2];
  REQUIRE(pipe(pipeFds) == 0);
  fflush(nullptr);

  const pid_t pid = fork();
  REQUIRE(pid >= 0);
  if (pid == 0) {
    // abort() doesn't flush stdio, and the host-platform logger uses stdout.
    setvbuf(stdout, nullptr, _IONBF, 0);
    dup2(pipeFds[1], STDOUT_FILENO);
    dup2(pipeFds[1], STDERR_FILENO);
    handleHermesFatal(reason);
  }
  close(pipeFds[1]);

  std::string output;
  char buffer[256];
  ssize_t count = 0;
  while ((count = read(pipeFds[0], buffer, sizeof(buffer))) > 0) {
    output.append(buffer, static_cast<size_t>(count));
  }
  close(pipeFds[0]);

  int status = 0;
  REQUIRE(waitpid(pid, &status, 0) == pid);
  REQUIRE(WIFSIGNALED(status));
  REQUIRE(WTERMSIG(status) == SIGABRT);
  REQUIRE(output.find("Hermes fatal error: " + reason) != std::string::npos);
}

#endif
