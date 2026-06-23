import {
  WRAPPER_INGRESS_CREATE_CONTRACT_VERSION,
  isCslWrapperIngressCreateRequestV1,
} from "wavebird/public-contracts";

const request = {
  contract_version: WRAPPER_INGRESS_CREATE_CONTRACT_VERSION,
  job: {
    job_type: "chat",
    slots_requested: 1,
  },
  context: {
    topic: "travel",
  },
  routing: {
    preferred_partner_id: "ssp_local_1",
    candidate_partner_ids: ["ssp_local_1"],
  },
  delivery: {
    mode: "polling",
  },
};

if (!isCslWrapperIngressCreateRequestV1(request)) {
  throw new Error("public contract example produced an invalid wrapper ingress request");
}

console.log("public contract example ok");
console.log(JSON.stringify(request, null, 2));
