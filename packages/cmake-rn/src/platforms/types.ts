import * as cli from "@react-native-node-api/cli-utils";

import type { program } from "../cli.js";

type InferOptionValues<Command extends cli.Command> = ReturnType<
  Command["opts"]
>;

type BaseCommand = typeof program;
type ExtendedCommand<Opts extends cli.OptionValues> = cli.Command<
  [],
  Opts & InferOptionValues<BaseCommand>,
  Record<string, unknown> // Global opts are not supported
>;

export type BaseOpts = Omit<InferOptionValues<typeof program>, "triplet">;

export type TripletContext<Triplet extends string> = {
  triplet: Triplet;
  buildPath: string;
  outputPath: string;
};

export type Platform<
  Triplets extends string[] = string[],
  Opts extends cli.OptionValues = Record<string, unknown>,
  Command = ExtendedCommand<Opts>,
> = {
  /**
   * Used to identify the platform in the CLI.
   */
  id: string;
  /**
   * Name of the platform, used for display purposes.
   */
  name: string;
  /**
   * All the triplets supported by this platform.
   */
  triplets: Readonly<Triplets>;
  /**
   * Get the limited subset of triplets that should be built by default for this platform, to support a development workflow.
   */
  defaultTriplets(): Triplets[number][] | Promise<Triplets[number][]>;
  /**
   * Implement this to add any platform specific options to the command.
   */
  amendCommand(command: BaseCommand): Command;
  /**
   * Check if the platform is supported by the host system, running the build.
   */
  isSupportedByHost(): boolean | Promise<boolean>;
  /**
   * Platform specific arguments passed to CMake to configure a triplet project.
   */
  configureArgs(
    context: TripletContext<Triplets[number]>,
    options: BaseOpts & Opts,
  ): string[];
  /**
   * Platform specific arguments passed to CMake to build a triplet project.
   */
  buildArgs(
    context: TripletContext<Triplets[number]>,
    options: BaseOpts & Opts,
  ): string[];
  /**
   * Called to combine multiple triplets into a single prebuilt artefact.
   */
  postBuild(
    context: {
      /**
       * Location of the final prebuilt artefact.
       */
      outputPath: string;
      triplets: TripletContext<Triplets[number]>[];
    },
    options: BaseOpts & Opts,
  ): Promise<void>;
};
