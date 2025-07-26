import * as commander from "@commander-js/extra-typings";
import type { program } from "../cli.js";

type InferOptionValues<Command extends commander.Command> = ReturnType<
  Command["opts"]
>;

type BaseCommand = typeof program;
type ExtendedCommand<Opts extends commander.OptionValues> = commander.Command<
  [],
  Opts & InferOptionValues<BaseCommand>,
  Record<string, unknown> // Global opts are not supported
>;

export type BaseOpts = Omit<InferOptionValues<typeof program>, "target">;

export type TargetContext<Target extends string> = {
  target: Target;
  buildPath: string;
  outputPath: string;
};

export type Platform<
  Targets extends string[] = string[],
  Opts extends commander.OptionValues = Record<string, unknown>,
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
   * All the targets supported by this platform.
   */
  targets: Readonly<Targets>;
  /**
   * Get the limited subset of targets that should be built by default for this platform, to support a development workflow.
   */
  defaultTargets(): Targets[number][] | Promise<Targets[number][]>;
  /**
   * Implement this to add any platform specific options to the command.
   */
  amendCommand(command: BaseCommand): Command;
  /**
   * Check if the platform is supported by the host system, running the build.
   */
  isSupportedByHost(): boolean | Promise<boolean>;
  /**
   * Platform specific arguments passed to CMake to configure a target project.
   */
  configureArgs(
    context: TargetContext<Targets[number]>,
    options: BaseOpts & Opts,
  ): string[];
  /**
   * Platform specific arguments passed to CMake to build a target project.
   */
  buildArgs(
    context: TargetContext<Targets[number]>,
    options: BaseOpts & Opts,
  ): string[];
  /**
   * Called to combine multiple targets into a single prebuilt artefact.
   */
  postBuild(
    context: {
      /**
       * Location of the final prebuilt artefact.
       */
      outputPath: string;
      targets: TargetContext<Targets[number]>[];
    },
    options: BaseOpts & Opts,
  ): Promise<void>;
};
