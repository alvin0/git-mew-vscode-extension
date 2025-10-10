import { ILLMAdapter } from "../llm-adapter";
import {
  FunctionCall,
  ToolCallResult,
  ToolExecuteResponse,
} from "./toolInterface";

export const functionCallExecute = async ({
  functionCalls,
  llmAdapter,
  toolCalls,
  onStream = () => {},
}: {
  functionCalls: FunctionCall[];
  onStream?: (content: string, isDone: boolean, state?: any) => void;
  toolCalls: Array<ToolCallResult>;
  llmAdapter: ILLMAdapter;
}): Promise<
  {
    tool: ToolCallResult;
    result: ToolExecuteResponse;
  }[]
> => {
  const resultExecute: {
    tool: ToolCallResult;
    result: ToolExecuteResponse;
  }[] = [];
  for (const toolCall of toolCalls) {
    if (toolCall.function && toolCall.function.name) {
      const { functionName, args } = extractToolCallData(toolCall);
      //   const mcpInfo = extractMcpInfo(functionName);

      //   if (mcpInfo) {
      //     const { getClientMcpById } = useMcpStore.getState();
      //     const clientMcp = getClientMcpById(mcpInfo.mcpId);

      //     if (clientMcp) {
      //       resultExecute.push({
      //         tool: toolCall,
      //         result: await mcpFunctionCalling({
      //           mcpName: clientMcp.mcpName,
      //           client: clientMcp.client,
      //           toolName: mcpInfo.toolName,
      //           toolArguments: args,
      //           onStream,
      //         }),
      //       });
      //     }
      //   } else {
      const functionCall = findFunctionCallById(functionCalls, functionName);
      if (functionCall) {
        resultExecute.push({
          tool: toolCall,
          result: await functionCall.execute(args, {
            llmAdapter: llmAdapter,
          }),
        });
      }
      //   }
    } else {
      // console.log(toolCall.function, toolCall.id, toolCall.function.name);
    }
  }

  return resultExecute;
};

/**
 * Extracts function name and arguments from a tool call
 *
 * @param toolCall - The tool call object
 * @param defaultArgs - Default value to use if arguments are not present (defaults to "{}")
 * @returns Object containing the function name and parsed arguments
 */
export function extractToolCallData(
  toolCall: { function?: { name?: string; arguments?: string } },
  defaultArgs: string = "{}"
) {
  if (!toolCall?.function) {
    throw new Error("Invalid tool call: missing function property");
  }
  const functionName = toolCall.function.name || "";
  const argumentsStr = toolCall.function.arguments || defaultArgs || "{}";

  let args;
  try {
    args = JSON.parse(argumentsStr);
  } catch (error) {
    console.warn("Failed to parse tool call arguments:", argumentsStr, error);
    // Try to clean up common JSON issues
    const cleanedArgs = argumentsStr.trim();
    try {
      args = JSON.parse(cleanedArgs);
    } catch (secondError) {
      console.error(
        "Failed to parse cleaned arguments, using empty object:",
        cleanedArgs,
        secondError
      );
      args = {};
    }
  }

  return { functionName, args };
}

/**
 * Finds a function call by its ID
 *
 * @param functionCalls - Array of function calls to search
 * @param id - ID of the function call to find
 * @returns The matching function call or undefined if not found
 */
export function findFunctionCallById(
  functionCalls: FunctionCall[],
  id: string
): FunctionCall | undefined {
  return functionCalls.find((fnCall) => fnCall.id === id);
}

/**
 * Format file content in standardized XML format
 * @param files Array of file information to format
 * @param toolName Name of the tool calling this formatter
 * @param query Optional query/symbol name that was searched
 * @returns Formatted string in XML structure
 */
export function formatFileContentResponse(
  files: Array<{
    path: string;
    startLine: number;
    endLine: number;
    lines: string[];
    note?: string;
  }>,
  toolName: string,
  query?: string
): string {
  const fileContents = files.map(file => {
    const contentLines = file.lines.map((line, index) => {
      const lineNumber = file.startLine + index;
      return `${lineNumber} | ${line}`;
    }).join('\n');

    let fileBlock =
      `<file>\n` +
      `<path>${file.path}</path>\n` +
      `<content lines="${file.startLine}-${file.endLine}">\n` +
      `${contentLines}\n` +
      `</content>\n`;
    
    if (file.note) {
      fileBlock += `<note>${file.note}</note>\n`;
    }
    
    fileBlock += `</file>`;
    
    return fileBlock;
  }).join('\n');

  const queryPart = query ? ` for '${query}'` : '';
  return (
    `[${toolName}${queryPart}] Result:\n\n` +
    `<files>\n` +
    `${fileContents}\n` +
    `</files>`
  );
}
