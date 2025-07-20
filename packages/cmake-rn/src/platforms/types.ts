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

export type TargetContext<Target> = {
  target: Target;
  buildPath: string;
  outputPath: string;
};

export type Platform<
  Target = unknown,
  Opts extends commander.OptionValues = Record<string, unknown>,
  Command = ExtendedCommand<Opts>
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
  targets: Readonly<Target[]>;
  /**
   * Get the limited subset of targets that should be built by default for this platform, to support a development workflow.
   */
  defaultTargets(): Target[] | Promise<Target[]>;
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
    context: TargetContext<Target>,
    options: BaseOpts & Opts
  ): string[];
  /**
   * Platform specific arguments passed to CMake to build a target project.
   */
  buildArgs(context: TargetContext<Target>, options: BaseOpts & Opts): string[];
  /**
   * Called to combine multiple targets into a single prebuilt artefact.
   */
  postBuild(
    context: {
      /**
       * Location of the final prebuilt artefact.
       */
      outputPath: string;
      targets: TargetContext<Target>[];
    },
    options: BaseOpts & Opts
  ): Promise<void>;
};
