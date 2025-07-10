#include <node_api.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define NODE_API_RETVAL_NOTHING  // Intentionally blank #define

#define GET_AND_THROW_LAST_ERROR(env)                                          \
  do {                                                                         \
    const napi_extended_error_info* error_info;                                \
    napi_get_last_error_info((env), &error_info);                              \
    bool is_pending;                                                           \
    const char* err_message = error_info->error_message;                       \
    napi_is_exception_pending((env), &is_pending);                             \
    /* If an exception is already pending, don't rethrow it */                 \
    if (!is_pending) {                                                         \
      const char* error_message =                                              \
          err_message != NULL ? err_message : "empty error message";           \
      napi_throw_error((env), NULL, error_message);                            \
    }                                                                          \
  } while (0)

// The basic version of GET_AND_THROW_LAST_ERROR. We cannot access any
// exceptions and we cannot fail by way of JS exception, so we abort.
#define FATALLY_FAIL_WITH_LAST_ERROR(env)                                      \
  do {                                                                         \
    const napi_extended_error_info* error_info;                                \
    napi_get_last_error_info((env), &error_info);                              \
    const char* err_message = error_info->error_message;                       \
    const char* error_message =                                                \
        err_message != NULL ? err_message : "empty error message";             \
    fprintf(stderr, "%s\n", error_message);                                    \
    abort();                                                                   \
  } while (0)

#define NODE_API_ASSERT_BASE(env, assertion, message, ret_val)                 \
  do {                                                                         \
    if (!(assertion)) {                                                        \
      napi_throw_error(                                                        \
          (env), NULL, "assertion (" #assertion ") failed: " message);         \
      return ret_val;                                                          \
    }                                                                          \
  } while (0)

#define NODE_API_BASIC_ASSERT_BASE(assertion, message, ret_val)                \
  do {                                                                         \
    if (!(assertion)) {                                                        \
      fprintf(stderr, "assertion (" #assertion ") failed: " message);          \
      abort();                                                                 \
      return ret_val;                                                          \
    }                                                                          \
  } while (0)

// Returns NULL on failed assertion.
// This is meant to be used inside napi_callback methods.
#define NODE_API_ASSERT(env, assertion, message)                               \
  NODE_API_ASSERT_BASE(env, assertion, message, NULL)

// Returns empty on failed assertion.
// This is meant to be used inside functions with void return type.
#define NODE_API_ASSERT_RETURN_VOID(env, assertion, message)                   \
  NODE_API_ASSERT_BASE(env, assertion, message, NODE_API_RETVAL_NOTHING)

#define NODE_API_BASIC_ASSERT_RETURN_VOID(assertion, message)                  \
  NODE_API_BASIC_ASSERT_BASE(assertion, message, NODE_API_RETVAL_NOTHING)

#define NODE_API_CALL_BASE(env, the_call, ret_val)                             \
  do {                                                                         \
    if ((the_call) != napi_ok) {                                               \
      GET_AND_THROW_LAST_ERROR((env));                                         \
      return ret_val;                                                          \
    }                                                                          \
  } while (0)

#define NODE_API_BASIC_CALL_BASE(env, the_call, ret_val)                       \
  do {                                                                         \
    if ((the_call) != napi_ok) {                                               \
      FATALLY_FAIL_WITH_LAST_ERROR((env));                                     \
      return ret_val;                                                          \
    }                                                                          \
  } while (0)

// Returns NULL if the_call doesn't return napi_ok.
#define NODE_API_CALL(env, the_call) NODE_API_CALL_BASE(env, the_call, NULL)

// Returns empty if the_call doesn't return napi_ok.
#define NODE_API_CALL_RETURN_VOID(env, the_call)                               \
  NODE_API_CALL_BASE(env, the_call, NODE_API_RETVAL_NOTHING)

#define NODE_API_BASIC_CALL_RETURN_VOID(env, the_call)                         \
  NODE_API_BASIC_CALL_BASE(env, the_call, NODE_API_RETVAL_NOTHING)

#define NODE_API_CHECK_STATUS(the_call)                                        \
  do {                                                                         \
    napi_status status = (the_call);                                           \
    if (status != napi_ok) {                                                   \
      return status;                                                           \
    }                                                                          \
  } while (0)

#define NODE_API_ASSERT_STATUS(env, assertion, message)                        \
  NODE_API_ASSERT_BASE(env, assertion, message, napi_generic_failure)

#define DECLARE_NODE_API_PROPERTY(name, func)                                  \
  {(name), NULL, (func), NULL, NULL, NULL, napi_default, NULL}

#define DECLARE_NODE_API_GETTER(name, func)                                    \
  {(name), NULL, NULL, (func), NULL, NULL, napi_default, NULL}

#define DECLARE_NODE_API_PROPERTY_VALUE(name, value)                           \
  {(name), NULL, NULL, NULL, NULL, (value), napi_default, NULL}

static inline void add_returned_status(napi_env env,
    const char* key,
    napi_value object,
    char* expected_message,
    napi_status expected_status,
    napi_status actual_status);

static inline void add_last_status(
    napi_env env, const char* key, napi_value return_value);

static const char theText[] =
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit.";

static int deleterCallCount = 0;

static void deleteTheText(
    node_api_basic_env env, void* data, void* finalize_hint) {
  NODE_API_BASIC_ASSERT_RETURN_VOID(
      data != NULL && strcmp(data, theText) == 0, "invalid data");

  printf("XDDDD");
  (void)finalize_hint;
  free(data);
  deleterCallCount++;
}

static void noopDeleter(
    node_api_basic_env env, void* data, void* finalize_hint) {
  NODE_API_BASIC_ASSERT_RETURN_VOID(
      data != NULL && strcmp(data, theText) == 0, "invalid data");
  (void)finalize_hint;
  deleterCallCount++;
}

static napi_value newBuffer(napi_env env, napi_callback_info info) {
  napi_value theBuffer;
  char* theCopy;
  const unsigned int kBufferSize = sizeof(theText);

  NODE_API_CALL(env,
      napi_create_buffer(env, sizeof(theText), (void**)(&theCopy), &theBuffer));
  NODE_API_ASSERT(env, theCopy, "Failed to copy static text for newBuffer");
  memcpy(theCopy, theText, kBufferSize);

  return theBuffer;
}

static napi_value newExternalBuffer(napi_env env, napi_callback_info info) {
  printf("creating external buffer\n");
  napi_value theBuffer;
  char* theCopy = strdup(theText);
  NODE_API_ASSERT(
      env, theCopy, "Failed to copy static text for newExternalBuffer");
  NODE_API_CALL(env,
      napi_create_external_buffer(env,
          sizeof(theText),
          theCopy,
          deleteTheText,
          NULL /* finalize_hint */,
          &theBuffer));

  return theBuffer;
}

static napi_value getDeleterCallCount(napi_env env, napi_callback_info info) {
  napi_value callCount;
  NODE_API_CALL(env, napi_create_int32(env, deleterCallCount, &callCount));
  return callCount;
}

static napi_value copyBuffer(napi_env env, napi_callback_info info) {
  napi_value theBuffer;
  NODE_API_CALL(env,
      napi_create_buffer_copy(env, sizeof(theText), theText, NULL, &theBuffer));
  return theBuffer;
}

static napi_value bufferHasInstance(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  NODE_API_CALL(env, napi_get_cb_info(env, info, &argc, args, NULL, NULL));
  NODE_API_ASSERT(env, argc == 1, "Wrong number of arguments");
  napi_value theBuffer = args[0];
  bool hasInstance;
  napi_valuetype theType;
  NODE_API_CALL(env, napi_typeof(env, theBuffer, &theType));
  NODE_API_ASSERT(env,
      theType == napi_object,
      "bufferHasInstance: instance is not an object");
  NODE_API_CALL(env, napi_is_buffer(env, theBuffer, &hasInstance));
  NODE_API_ASSERT(
      env, hasInstance, "bufferHasInstance: instance is not a buffer");
  napi_value returnValue;
  NODE_API_CALL(env, napi_get_boolean(env, hasInstance, &returnValue));
  return returnValue;
}

static napi_value bufferInfo(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  NODE_API_CALL(env, napi_get_cb_info(env, info, &argc, args, NULL, NULL));
  NODE_API_ASSERT(env, argc == 1, "Wrong number of arguments");
  napi_value theBuffer = args[0];
  char* bufferData;
  napi_value returnValue;
  size_t bufferLength;
  NODE_API_CALL(env,
      napi_get_buffer_info(
          env, theBuffer, (void**)(&bufferData), &bufferLength));
  NODE_API_CALL(env,
      napi_get_boolean(env,
          !strcmp(bufferData, theText) && bufferLength == sizeof(theText),
          &returnValue));
  return returnValue;
}

static napi_value staticBuffer(napi_env env, napi_callback_info info) {
  napi_value theBuffer;
  NODE_API_CALL(env,
      napi_create_external_buffer(env,
          sizeof(theText),
          (void*)theText,
          noopDeleter,
          NULL /* finalize_hint */,
          &theBuffer));
  return theBuffer;
}

static napi_value invalidObjectAsBuffer(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  NODE_API_CALL(env, napi_get_cb_info(env, info, &argc, args, NULL, NULL));
  NODE_API_ASSERT(env, argc == 1, "Wrong number of arguments");

  napi_value notTheBuffer = args[0];
  napi_status status = napi_get_buffer_info(env, notTheBuffer, NULL, NULL);
  NODE_API_ASSERT(env,
      status == napi_invalid_arg,
      "napi_get_buffer_info: should fail with napi_invalid_arg "
      "when passed non buffer");

  return notTheBuffer;
}

static napi_value Init(napi_env env, napi_value exports) {
  napi_value theValue;

  NODE_API_CALL(
      env, napi_create_string_utf8(env, theText, sizeof(theText), &theValue));
  NODE_API_CALL(
      env, napi_set_named_property(env, exports, "theText", theValue));

  napi_property_descriptor methods[] = {
      DECLARE_NODE_API_PROPERTY("newBuffer", newBuffer),
      DECLARE_NODE_API_PROPERTY("newExternalBuffer", newExternalBuffer),
      DECLARE_NODE_API_PROPERTY("getDeleterCallCount", getDeleterCallCount),
      DECLARE_NODE_API_PROPERTY("copyBuffer", copyBuffer),
      DECLARE_NODE_API_PROPERTY("bufferHasInstance", bufferHasInstance),
      DECLARE_NODE_API_PROPERTY("bufferInfo", bufferInfo),
      DECLARE_NODE_API_PROPERTY("staticBuffer", staticBuffer),
      DECLARE_NODE_API_PROPERTY("invalidObjectAsBuffer", invalidObjectAsBuffer),
  };

  NODE_API_CALL(env,
      napi_define_properties(
          env, exports, sizeof(methods) / sizeof(methods[0]), methods));

  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)