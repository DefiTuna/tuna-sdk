import { Address, Rpc, SolanaRpcApi } from "@solana/kit";

export async function accountExists(rpc: Rpc<SolanaRpcApi>, address: Address): Promise<boolean> {
  const { value: accountInfo } = await rpc.getAccountInfo(address, { encoding: "base64" }).send();
  return Boolean(accountInfo);
}
