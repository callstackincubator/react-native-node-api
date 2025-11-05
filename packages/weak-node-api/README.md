# Weak Node-API

A clean linkable interface for Node-API and with runtime-injectable implementation.

This package is part of the [Node-API for React Native](https://github.com/callstackincubator/react-native-node-api) project, which brings Node-API support to React Native applications. However, it can be used independently in any context where an indirect / weak Node-API implementation is needed.

## Why is this needed?

Android's dynamic linker restricts access to global symbols—dynamic libraries must explicitly declare dependencies as `DT_NEEDED` to access symbols. In the context of React Native, the Node-API implementation is split between Hermes and a host runtime, native addons built for Android would otherwise need to explicitly link against both - which is not ideal for multiple reasons.

This library provides a solution by:

- Exposing only Node-API functions without implementation
- Allowing runtime injection of the actual implementation by the host
- Eliminating the need for addons to suppress undefined symbol errors

## Is this usable in the context of Node.js?

While originally designed for React Native's split Node-API implementation, this approach could potentially be adapted for Node.js scenarios where addons need to link with undefined symbols allowed. Usage patterns and examples for Node.js contexts are being explored and this pattern could eventually be upstreamed to Node.js itself, benefiting the broader Node-API ecosystem.
