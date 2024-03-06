import { expect } from "chai";
import { ethers } from "hardhat";
import { utils } from "ffjavascript";
import { BigNumber, BigNumberish } from "ethers";

const { unstringifyBigInts } = utils;
const fs = require("fs");
const snarkjs = require("snarkjs");

interface ICallData {
  pi_a: BigNumberish[];
  pi_b: BigNumberish[][];
  pi_c: BigNumberish[];
  input: BigNumberish[];
}

const BASE_PATH = "./circuits/multiplier/";

function p256(n: any): BigNumber {
  let nstr = n.toString(16);
  while (nstr.length < 64) nstr = "0" + nstr;
  nstr = `0x${nstr}`;
  return BigNumber.from(nstr);
}

async function generateProof() {
  // read input parameters
  const inputData = fs.readFileSync(BASE_PATH + "input.json", "utf8");
  const input = JSON.parse(inputData);

  // calculate witness
  await snarkjs.wtns.calculate(
    input,
    BASE_PATH + "out/circuit.wasm",
    BASE_PATH + "out/circuit.wtns"
  );

  // calculate proof
  const proof = await snarkjs.groth16.prove(
    BASE_PATH + "out/multiplier.zkey",
    BASE_PATH + "out/circuit.wtns"
  );

  // write proof to file
  fs.writeFileSync(
    BASE_PATH + "out/proof.json",
    JSON.stringify(proof, null, 1)
  );

  return proof;
}

async function generateCallData(): Promise<ICallData> {
  const zkProof = await generateProof();

  const proof = unstringifyBigInts(zkProof.proof);
  const pub = unstringifyBigInts(zkProof.publicSignals);

  let inputs = "";
  for (let i = 0; i < pub.length; i++) {
    if (inputs !== "") inputs = inputs + ",";
    inputs = inputs + p256(pub[i]);
  }

  const pi_a = [p256(proof.pi_a[0]), p256(proof.pi_a[1])];
  const pi_b = [
    [p256(proof.pi_b[0][1]), p256(proof.pi_b[0][0])],
    [p256(proof.pi_b[1][1]), p256(proof.pi_b[1][0])],
  ];
  const pi_c = [p256(proof.pi_c[0]), p256(proof.pi_c[1])];
  const input = [inputs];

  return { pi_a, pi_b, pi_c, input };
}

describe("MultiplierVerifier", function () {
  it("should verify the proof correctly", async function () {
    // deploy contract
    const Verifier = await ethers.getContractFactory("Verifier");
    const verifier = await Verifier.deploy();
    await verifier.deployed();

    console.log(`Verifier deployed to ${verifier.address}`);

    // generate proof call data
    const { pi_a, pi_b, pi_c, input } = await generateCallData();

    // verify proof on contract
    // @ts-ignore
    const tx = await verifier.verifyProof(pi_a, pi_b, pi_c, input);

    console.log(`Verifier result: ${tx}`);
    expect(tx).to.equal(true);
  });
});
