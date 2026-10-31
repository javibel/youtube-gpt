import {createObserverEnvelopeContract,type ObserverEnvelopePolicy,type ObserverRequestData,type ObserverBindingData} from '../../contracts/ai/v1/observer-channel.cjs';
import type {ObserverEnvelopePolicy as AgentPolicy} from '../../../migration-agent/contracts/ai/v1/observer-channel.cjs';
import type {ModelMetadataChecker} from '../../lib/ai/model-metadata-readiness.cjs';
declare const policy:ObserverEnvelopePolicy;
declare const request:ObserverRequestData;
declare const binding:ObserverBindingData;
declare const signature:string;
const agentCompatible:AgentPolicy=policy;void agentCompatible;
const contract=createObserverEnvelopeContract(policy),wire=contract.encodeRequest(request,signature),parsed=contract.parseResult(wire,wire);
const trust:'untrusted-observer-data'=parsed.trust;void trust;
// @ts-expect-error An untrusted envelope is not a bound model metadata checker result.
const checker:ModelMetadataChecker=async()=>parsed;
void checker;
// @ts-expect-error Captured parsed peer data is deeply readonly.
parsed.unsigned.requester.peerId='replace';
// @ts-expect-error Credential availability cannot carry a model selection.
const invalid:ObserverRequestData={...binding,kind:'request',operation:'credential-availability-boolean',model:'unexpected'};
void invalid;
// @ts-expect-error Generation/activation is outside this public wire grammar.
contract.encodeRequest({...request,activate:true},signature);
