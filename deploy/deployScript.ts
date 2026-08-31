import { readFileSync } from "fs";
import path from "path";
import { ExecutionResult, TransactionHash, TransactionStatus, GenLayerClient } from "genlayer-js/types";


export default async function main(client: GenLayerClient<any>) {
  const filePath = path.resolve(process.cwd(), "contracts/nimbuspact.py");

  try {
    const contractCode = new Uint8Array(readFileSync(filePath));

    await client.initializeConsensusSmartContract();

    const deployTransaction = await client.deployContract({
      code: contractCode,
      args: [],
    });

    const receipt = await client.waitForTransactionReceipt({
      hash: deployTransaction as TransactionHash,
      status: TransactionStatus.FINALIZED,
      retries: 200,
    });

    const executionSucceeded =
      receipt.txExecutionResultName === ExecutionResult.FINISHED_WITH_RETURN ||
      receipt.txExecutionResultName === "FINISHED_WITH_RETURN" ||
      receipt.consensus_data?.leader_receipt[0]?.execution_result === "SUCCESS";
    if (!executionSucceeded) {
      throw new Error(`Deployment failed. Receipt: ${JSON.stringify(receipt)}`);
    }

    console.log("\n Contract deployed successfully.", {
      "Transaction Hash": deployTransaction,
      "Contract Address": receipt.data?.contract_address,
    });
  } catch (error) {
    throw new Error((`Error during deployment:, ${error}`));
  }
}
