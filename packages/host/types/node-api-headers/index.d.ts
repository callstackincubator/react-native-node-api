module "node-api-headers" {
  type SymbolsPerInterface = {
    js_native_api_symbols: string[];
    node_api_symbols: string[];
  };
  type Exported = {
    include_dir: string;
    def_paths: {
      js_native_api_def: string;
      node_api_def: string;
    };
    symbols: {
      v1: SymbolsPerInterface;
      v2: SymbolsPerInterface;
      v3: SymbolsPerInterface;
      v4: SymbolsPerInterface;
      v5: SymbolsPerInterface;
      v6: SymbolsPerInterface;
      v7: SymbolsPerInterface;
      v8: SymbolsPerInterface;
      v9: SymbolsPerInterface;
      v10: SymbolsPerInterface;
    };
  };
  export type NodeApiVersion = keyof Exported["symbols"];

  const exported: Exported;
  export = exported;
}
