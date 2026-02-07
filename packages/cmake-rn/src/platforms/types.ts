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
  /**
   * Spawn a command in the context of this triplet
   */
  spawn: Spawn;
};

export type Spawn = (
  command: string,
  args: string[],
  cwd?: string,
) => Promise<void>;

export type Platform<
  Triplets extends string[] = string[],
  Opts extends cli.OptionValues = Record<string, unknown>,
  Command = ExtendedCommand<Opts>,
  Triplet extends string = Triplets[number],
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
   * Get the limited subset of triplets that should be built by default for this platform.
   */
  defaultTriplets(
    mode: "current-development" | "all",
  ): Triplet[] | Promise<Triplet[]>;
  /**
   * Assert the combination of triplets is supported by the platform.
   * @throws {Error} If the combination of triplets is not supported.
   */
  assertValidTriplets(triplets: Triplet[]): void;
  /**
   * Implement this to add any platform specific options to the command.
   */
  amendCommand(command: BaseCommand): Command;
  /**
   * Check if the platform is supported by the host system, running the build.
   */
  isSupportedByHost(): boolean | Promise<boolean>;
  /**
   * Configure all projects for this platform.
   */
  configure(
    triplets: TripletContext<Triplet>[],
    options: BaseOpts & Opts,
    spawn: Spawn,
  ): Promise<void>;
  /**
   * Platform specific command to build a triplet project.
   */
  build(
    context: TripletContext<Triplet>,
    options: BaseOpts & Opts,
  ): Promise<void>;
  /**
   * Called to combine multiple triplets into a single prebuilt artefact.
   */
  postBuild(
    /**
     * Location of the final prebuilt artefact.
     */
    outputPath: string,
    triplets: TripletContext<Triplet>[],
    options: BaseOpts & Opts,
  ): Promise<void>;
};
