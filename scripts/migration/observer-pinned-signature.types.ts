import {createPinnedObserverSignatureChecker,ObserverEnvelopePolicy,OriginalObserverPublicPin} from '../../contracts/ai/v1/observer-channel.cjs';
import {createPinnedObserverSignatureChecker as createAgentChecker} from '../../../migration-agent/contracts/ai/v1/observer-channel.cjs';
import type {ModelMetadataChecker} from '../../lib/ai/model-metadata-readiness.cjs';
declare const policy:ObserverEnvelopePolicy;
declare const requester:OriginalObserverPublicPin,responder:OriginalObserverPublicPin;
const checker=createPinnedObserverSignatureChecker(policy,{requester,responder});
createAgentChecker(policy,{requester,responder});
const checked=checker.checkResultSignature('wire','request');
const untrusted:'untrusted-observer-data'=checked.data.trust;
// @ts-expect-error Signature facts cannot be readiness observations.
const readiness:ModelMetadataChecker=async()=>checked;
// @ts-expect-error A serialized public key does not satisfy the original native public-key input.
createPinnedObserverSignatureChecker(policy,{requester:{...requester,publicKey:'pem-from-json'},responder});
// @ts-expect-error There is no enrollment or authorization capability.
checker.authorize();
// @ts-expect-error Signature output identities are immutable.
checked.signer.keyId='changed';
void untrusted;void readiness;
