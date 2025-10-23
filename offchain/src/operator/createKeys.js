import { Lucid, C } from "lucid-cardano";
import { promises as fs } from "node:fs";
import path from "node:path";

const DEFAULT_OUTPUT_DIR = "operator_keys";
const VKEY_FILENAME = "operator.vkey.bech32";
const SKEY_FILENAME = "operator.skey.bech32";
const ADDRESS_FILENAME = "operator.enterprise.addr";

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function createOperatorKeys({ outputDir } = {}) {
  const network = process.env.CARDANO_NETWORK || "Preprod";

  const lucid = await Lucid.new(undefined, network);
  const operatorSkey = lucid.utils.generatePrivateKey();
  const operatorVkey = C.PrivateKey.from_bech32(operatorSkey).to_public().to_bech32();

  lucid.selectWalletFromPrivateKey(operatorSkey);
  const operatorAddress = await lucid.wallet.address();

  const resolvedDir = path.resolve(process.cwd(), outputDir || DEFAULT_OUTPUT_DIR);
  await ensureDir(resolvedDir);

  const vkeyPath = path.join(resolvedDir, VKEY_FILENAME);
  const skeyPath = path.join(resolvedDir, SKEY_FILENAME);
  const addressPath = path.join(resolvedDir, ADDRESS_FILENAME);

  if (
    await pathExists(vkeyPath) || await pathExists(skeyPath) ||
    await pathExists(addressPath)
  ) {
    throw new Error(
      `Key files already exist in ${resolvedDir}. Remove them or choose a different output directory.`,
    );
  }

  await fs.writeFile(vkeyPath, `${operatorVkey}\n`, { encoding: "utf8", mode: 0o644 });
  await fs.writeFile(skeyPath, `${operatorSkey}\n`, { encoding: "utf8", mode: 0o600 });
  await fs.writeFile(addressPath, `${operatorAddress}\n`, { encoding: "utf8", mode: 0o644 });

  return {
    operatorAddress,
    operatorVkey,
    operatorSkey,
    vkeyPath,
    skeyPath,
    addressPath,
  };
}
