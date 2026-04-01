import { ILLMAdapter } from "../llm-adapter";

export type ToolState = {
  // Stores results of all previous steps
  stepResults: Record<number, any>;

  // Stores the current step's process information
  currentStep: {
    process: number;
    tool: string;
    description: string;
    relationship: Record<
      number,
      {
        result: any;
        tool: string;
        description: string;
        parameters: Record<string, any>;
      }
    >; // Enhanced relationship structure
  };
};

export type ToolOptional = {
  state?: ToolState;
  llmAdapter: ILLMAdapter;
  abortController?: AbortController;
  sharedStore?: any; // SharedContextStore — typed as `any` to avoid circular dependency, cast in query_context tool
  queryContextCallCount?: { value: number };
  /** When set, read_file and query_context will read file content from this git ref instead of working tree */
  compareBranch?: string;
  /** GitService instance for branch-aware file reading */
  gitService?: any;
};

export type ToolExecuteResponse = {
  error?: string;
  description: string;
  contentType?: "text" | "image" | "file" | "audio" | "video";
  function?: {
    name: string;
    description: string;
    parameters: string;
  }[];
};

export type ToolCallResult = {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
};

export type FunctionCallingInfo = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<
        string,
        {
          type: string;
          description: string;
          items?: {
            type: string;
            description: string;
          };
        }
      >;
      required: string[];
      additionalProperties?: boolean;
    };
  };
};

export type FunctionCall = {
  id: string;
  functionCalling: FunctionCallingInfo;
  execute: (args: any, optional?: ToolOptional) => Promise<ToolExecuteResponse>;
  prevStep?: string;
  nextStep?: string;
};
