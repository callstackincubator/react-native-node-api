import React from "react";
import { StyleSheet, View, SafeAreaView } from "react-native";

import {
  MochaRemoteProvider,
  ConnectionText,
  StatusEmoji,
  StatusText,
} from "mocha-remote-react-native";

import { suites as nodeAddonExamplesSuites } from "@react-native-node-api/node-addon-examples";

function describeIf(
  condition: boolean,
  title: string,
  fn: (this: Mocha.Suite) => void,
) {
  return condition ? describe(title, fn) : describe.skip(title, fn);
}

type Context = {
  allTests?: boolean;
  nodeAddonExamples?: boolean;
  ferricExample?: boolean;
};

function loadTests({
  allTests = false,
  nodeAddonExamples = allTests,
  ferricExample = allTests,
}: Context) {
  describeIf(nodeAddonExamples, "Node Addon Examples", () => {
    for (const [suiteName, examples] of Object.entries(
      nodeAddonExamplesSuites,
    )) {
      describe(suiteName, () => {
        for (const [exampleName, requireExample] of Object.entries(examples)) {
          it(exampleName, async () => {
            const test = requireExample();
            if (test instanceof Function) {
              await test();
            }
          });
        }
      });
    }
  });

  describeIf(ferricExample, "ferric-example", () => {
    it("exports a callable sum function", () => {
      /* eslint-disable-next-line @typescript-eslint/no-require-imports -- TODO: Determine why a dynamic import doesn't work on Android */
      const exampleAddon = require("ferric-example");
      const result = exampleAddon.sum(1, 3);
      if (result !== 4) {
        throw new Error(`Expected 1 + 3 to equal 4, but got ${result}`);
      }
    });
  });
}

export default function App() {
  return (
    <MochaRemoteProvider tests={loadTests}>
      <SafeAreaView style={styles.container}>
        <ConnectionText style={styles.connectionText} />
        <View style={styles.statusContainer}>
          <StatusEmoji style={styles.statusEmoji} />
          <StatusText style={styles.statusText} />
        </View>
      </SafeAreaView>
    </MochaRemoteProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  statusContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  statusEmoji: {
    fontSize: 30,
    margin: 30,
    textAlign: "center",
  },
  statusText: {
    fontSize: 20,
    margin: 20,
    textAlign: "center",
  },
  connectionText: {
    textAlign: "center",
  },
});
