import type { FunctionDecl } from "../../src/node-api-functions.js";
import { generateFunction } from "./shared.js";

const ARGUMENT_NAMES_PR_FUNCTION: Record<string, undefined | string[]> = {
  napi_create_threadsafe_function: [
    "env",
    "func",
    "async_resource",
    "async_resource_name",
    "max_queue_size",
    "initial_thread_count",
    "thread_finalize_data",
    "thread_finalize_cb",
    "context",
    "call_js_cb",
    "result",
  ],
  napi_add_async_cleanup_hook: ["env", "hook", "arg", "remove_handle"],
  napi_fatal_error: ["location", "location_len", "message", "message_len"],
};

export function generateFunctionDecl(fn: FunctionDecl) {
  return generateFunction({ ...fn, static: true });
}

export function generateHeader(functions: FunctionDecl[]) {
  return `
    #pragma once

    #include <memory>
    #include <vector>
    
    #include <node_api.h>

    #include "NodeApiHost.hpp"

    struct NodeApiMultiHost : public NodeApiHost {

      struct WrappedEnv;

      struct WrappedThreadsafeFunction {
        napi_threadsafe_function value;
        WrappedEnv *env;
        std::weak_ptr<NodeApiHost> host;
      };

      struct WrappedAsyncCleanupHookHandle {
        napi_async_cleanup_hook_handle value;
        WrappedEnv *env;
        std::weak_ptr<NodeApiHost> host;
      };

      struct WrappedEnv {
        WrappedEnv(napi_env &&value, std::weak_ptr<NodeApiHost> &&host);

        napi_env value;
        std::weak_ptr<NodeApiHost> host;

      private:
        std::vector<std::unique_ptr<WrappedThreadsafeFunction>>
            threadsafe_functions;
        std::vector<std::unique_ptr<WrappedAsyncCleanupHookHandle>>
            async_cleanup_hook_handles;

      public:
        napi_threadsafe_function wrap(napi_threadsafe_function original,
                                      WrappedEnv *env,
                                      std::weak_ptr<NodeApiHost>);
        napi_async_cleanup_hook_handle wrap(napi_async_cleanup_hook_handle original,
                                            WrappedEnv *env,
                                            std::weak_ptr<NodeApiHost>);
      };

      napi_env wrap(napi_env original, std::weak_ptr<NodeApiHost>);

      NodeApiMultiHost(
        void napi_module_register(napi_module *),
        void napi_fatal_error(const char *, size_t, const char *, size_t)
      );

      private:
        std::vector<std::unique_ptr<WrappedEnv>> envs;

      public:

      ${functions.map(generateFunctionDecl).join("\n")}
    };
  `;
}

function generateFunctionImpl(fn: FunctionDecl) {
  const { name, argumentTypes, returnType } = fn;
  const [firstArgument] = argumentTypes;
  const argumentNames =
    ARGUMENT_NAMES_PR_FUNCTION[name] ??
    argumentTypes.map((_, index) => `arg${index}`);
  if (name === "napi_fatal_error") {
    // Providing a default implementation
    return generateFunction({
      ...fn,
      namespace: "NodeApiMultiHost",
      argumentNames,
      body: `
        if (location && location_len) {
          fprintf(stderr, "Fatal Node-API error: %.*s %.*s",
            static_cast<int>(location_len),
            location,
            static_cast<int>(message_len),
            message
          );
        } else {
          fprintf(stderr, "Fatal Node-API error: %.*s", static_cast<int>(message_len), message);
        }
        abort();
      `,
    });
  } else if (name === "napi_module_register") {
    // Providing a default implementation
    return generateFunction({
      ...fn,
      namespace: "NodeApiMultiHost",
      argumentNames: [""],
      body: `
        fprintf(stderr, "napi_module_register is not implemented for this NodeApiMultiHost");
        abort();
      `,
    });
  } else if (
    [
      "napi_env",
      "node_api_basic_env",
      "napi_threadsafe_function",
      "napi_async_cleanup_hook_handle",
    ].includes(firstArgument)
  ) {
    const joinedArguments = argumentTypes
      .map((_, index) =>
        index === 0 ? "wrapped->value" : argumentNames[index],
      )
      .join(", ");

    function generateCall() {
      if (name === "napi_create_threadsafe_function") {
        return `
          auto status = host->${name}(${joinedArguments});
          if (status == napi_status::napi_ok) {
            *${argumentNames[10]} = wrapped->wrap(*${argumentNames[10]}, wrapped, wrapped->host);
          }
          return status;
        `;
      } else if (name === "napi_add_async_cleanup_hook") {
        return `
          auto status = host->${name}(${joinedArguments});
          if (status == napi_status::napi_ok) {
            *${argumentNames[3]} = wrapped->wrap(*${argumentNames[3]}, wrapped, wrapped->host);
          }
          return status;
        `;
      } else {
        return `
          ${returnType === "void" ? "" : "return"} host->${name}(${joinedArguments});
        `;
      }
    }

    function getWrappedType(nodeApiType: string) {
      if (nodeApiType === "napi_env" || nodeApiType === "node_api_basic_env") {
        return "WrappedEnv";
      } else if (nodeApiType === "napi_threadsafe_function") {
        return "WrappedThreadsafeFunction";
      } else if (nodeApiType === "napi_async_cleanup_hook_handle") {
        return "WrappedAsyncCleanupHookHandle";
      } else {
        throw new Error(`Unexpected Node-API type '${nodeApiType}'`);
      }
    }

    return generateFunction({
      ...fn,
      namespace: "NodeApiMultiHost",
      argumentNames,
      body: `
        auto wrapped = reinterpret_cast<${getWrappedType(firstArgument)}*>(${argumentNames[0]});
        if (auto host = wrapped->host.lock()) {
          if (host->${name} == nullptr) {
            fprintf(stderr, "Node-API function '${name}' called on a host which doesn't provide an implementation\\n");
            return napi_status::napi_generic_failure;
          }
          ${generateCall()}
        } else {
          fprintf(stderr, "Node-API function '${name}' called after host was destroyed.\\n");
          return napi_status::napi_generic_failure;
        }
      `,
    });
  } else {
    throw new Error(`Unexpected signature for '${name}' Node-API function`);
  }
}

export function generateSource(functions: FunctionDecl[]) {
  return `
    #include "NodeApiMultiHost.hpp"

    NodeApiMultiHost::NodeApiMultiHost(
      void napi_module_register(napi_module *),
      void napi_fatal_error(const char *, size_t, const char *, size_t)
    )
        : NodeApiHost({
          ${functions
            .map(({ name }) => {
              if (
                name === "napi_module_register" ||
                name === "napi_fatal_error"
              ) {
                // We take functions not taking a wrap-able argument via the constructor and call them directly
                return `.${name} = ${name} == nullptr ? NodeApiMultiHost::${name} : ${name},`;
              } else {
                return `.${name} = NodeApiMultiHost::${name},`;
              }
            })
            .join("\n")}
        }), envs{} {};
      
    // TODO: Ensure the Node-API functions aren't throwing (using NOEXCEPT)
    // TODO: Find a better way to delete these along the way

    NodeApiMultiHost::WrappedEnv::WrappedEnv(napi_env &&value,
                                             std::weak_ptr<NodeApiHost> &&host)
    : value(value), host(host), threadsafe_functions{},
      async_cleanup_hook_handles{} {}

    napi_env NodeApiMultiHost::wrap(napi_env value,
                                    std::weak_ptr<NodeApiHost> host) {
      auto ptr = std::make_unique<WrappedEnv>(std::move(value), std::move(host));
      auto raw_ptr = ptr.get();
      envs.push_back(std::move(ptr));
      return reinterpret_cast<napi_env>(raw_ptr);
    }

    napi_threadsafe_function
    NodeApiMultiHost::WrappedEnv::wrap(napi_threadsafe_function original,
                                       WrappedEnv *env,
                                       std::weak_ptr<NodeApiHost> weak_host) {
      auto ptr = std::make_unique<WrappedThreadsafeFunction>(original, env, weak_host);
      auto raw_ptr = ptr.get();
      env->threadsafe_functions.push_back(std::move(ptr));
      return reinterpret_cast<napi_threadsafe_function>(raw_ptr);
    }

    napi_async_cleanup_hook_handle
    NodeApiMultiHost::WrappedEnv::wrap(napi_async_cleanup_hook_handle original,
                                       WrappedEnv *env,
                                       std::weak_ptr<NodeApiHost> weak_host) {
      auto ptr = std::make_unique<WrappedAsyncCleanupHookHandle>(original, env, weak_host);
      auto raw_ptr = ptr.get();
      env->async_cleanup_hook_handles.push_back(std::move(ptr));
      return reinterpret_cast<napi_async_cleanup_hook_handle>(raw_ptr);
    }

    ${functions.map(generateFunctionImpl).join("\n")}
  `;
}
