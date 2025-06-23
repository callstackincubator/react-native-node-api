import React from "react";
import { StyleSheet, Text, View, Button } from "react-native";

/* eslint-disable @typescript-eslint/no-require-imports -- We're using require to defer crashes */

// import { requireNodeAddon } from "react-native-node-api";
import nodeAddonExamples from "react-native-node-addon-examples";
// import * as ferricExample from "ferric-example";

function App(): React.JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>React Native Node-API Modules</Text>
      {Object.entries(nodeAddonExamples).map(([suiteName, examples]) => (
        <View key={suiteName} style={styles.suite}>
          <Text>{suiteName}</Text>
          {Object.entries(examples).map(([exampleName, requireExample]) => (
            <Button
              key={exampleName}
              title={exampleName}
              onPress={requireExample}
            />
          ))}
        </View>
      ))}
      <View key="ferric-example" style={styles.suite}>
        <Text>ferric-example</Text>
        <Button
          title={"Ferric Example: sum(1, 3)"}
          onPress={() =>
            console.log("1+3 = " + require("ferric-example").sum(1, 3))
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  suite: {
    borderWidth: 1,
    width: "96%",
    margin: 10,
    padding: 10,
  },
  title: {
    fontSize: 20,
  },
});

export default App;
