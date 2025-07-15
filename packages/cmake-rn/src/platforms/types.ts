import { Option } from "@commander-js/extra-typings";

export type TargetContext<Target extends string> = {
  target: Target;
  outputPath: string;
};

/**
 * Context for the post-build step of a platform.
 */
export type PostBuildContext<Target extends string> = {
  /**
   * Location of the final prebuilt artefact.
   */
  outputPath: string;
  /**
   * Build configuration.
   */
  configuration: "Release" | "Debug";
  /**
   * Prepare the prebuilt for auto-linking for the React Native Node-API Host package.
   */
  prepareAutoLinking: boolean;
  /**
   * Context from each of the targets that were built and should be combined into the final prebuilt artefact.
   */
  targets: TargetContext<Target>[];
};

export type Platform<
  Target extends string,
  Options extends Option[],
  OptionsValues extends Record<string, unknown>
> = {
  /**
   * Used to identify the platform in the CLI.
   */
  id: string;
  /**
   * Name of the platform, used for display purposes.
   */
  name: string;
  targets: Target[];
  defaultTargets(targets: Target[]): Target[] | Promise<Target[]>;
  options: Options;
  isSupportedByHost(): boolean | Promise<boolean>;
  /**
   * Platform specific arguments passed to CMake to configure a target project.
   */
  configureArgs(options: { target: Target } & OptionsValues): string[];
  /**
   * Platform specific arguments passed to CMake to build a target project.
   */
  buildArgs(options: { target: Target } & OptionsValues): string[];
  /**
   * Called to combine multiple targets into a single prebuilt artefact.
   */
  postBuild(context: PostBuildContext<Target> & OptionsValues): Promise<void>;
};
