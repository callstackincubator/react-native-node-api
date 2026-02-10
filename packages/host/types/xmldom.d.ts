/**
 * Local type declaration for @xmldom/xmldom that does not pull in lib "dom".
 * Used via path mapping in tsconfig.node.json so we get correct xmldom types
 * without bleeding global DOM types (Document, Node, Element, etc.) into the project.
 */
declare module "@xmldom/xmldom" {
  interface XmldomDocument {
    readonly documentElement: XmldomElement;
  }

  interface XmldomElement {
    getAttribute(name: string): string | null;
    getElementsByTagName(name: string): XmldomNodeList<XmldomElement>;
  }

  interface XmldomNodeList<T = XmldomElement> {
    readonly length: number;
    item(index: number): T | null;
  }

  interface XmldomDOMParserOptions {
    locator?: unknown;
    errorHandler?:
      | ((level: string, msg: unknown) => unknown)
      | {
          warning?: (msg: unknown) => unknown;
          error?: (msg: unknown) => unknown;
          fatalError?: (msg: unknown) => unknown;
        };
  }

  interface XmldomDOMParserInstance {
    parseFromString(xmlsource: string, mimeType?: string): XmldomDocument;
  }

  interface XmldomDOMParserStatic {
    new (options?: XmldomDOMParserOptions): XmldomDOMParserInstance;
  }

  export const DOMParser: XmldomDOMParserStatic;
  export const XMLSerializer: unknown;
  export const DOMImplementation: unknown;
}
