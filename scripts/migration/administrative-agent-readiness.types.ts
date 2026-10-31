import {registerOriginalNativePlatformWebHostConfiguration,type OriginalNativePlatformWebHostConfiguration} from '../../lib/ai/platform-web-host-registration.cjs';
import {createOperationalWebDeployment,type OperationalWebDeploymentOptions} from '../../lib/ai/operational-deployment.cjs';
import {createOperationalWebComposition,type OperationalWebOptions} from '../../lib/ai/operational-composition.cjs';
import {createIdeogramSharedRuntimeDependencies,type IdeogramSharedRuntimeDependencies} from '../../lib/ai/ideogram-shared-runtime.cjs';
import {createSharedRuntimeBootstrap,type SharedRuntimeDependencies} from '../../lib/ai/shared-runtime-bootstrap.cjs';
declare const agent:NonNullable<SharedRuntimeDependencies['administrativeAgentReadiness']>;
declare const original:OriginalNativePlatformWebHostConfiguration;
declare const deployment:OperationalWebDeploymentOptions;
declare const composition:OperationalWebOptions;
declare const shared:SharedRuntimeDependencies;
declare const pictured:IdeogramSharedRuntimeDependencies;
registerOriginalNativePlatformWebHostConfiguration({...original,deployment:{...original.deployment,runtime:{...original.deployment.runtime,administrativeAgentReadiness:agent}}},{prepareTimeoutMs:1000,stopTimeoutMs:100});
createOperationalWebDeployment({...deployment,runtime:{...deployment.runtime,administrativeAgentReadiness:agent}});
createOperationalWebComposition({...composition,administrativeAgentReadiness:agent});
createSharedRuntimeBootstrap({...shared,administrativeAgentReadiness:agent});
createIdeogramSharedRuntimeDependencies({...pictured,administrativeAgentReadiness:agent});
// @ts-expect-error Original agent metadata observation cannot be omitted.
createSharedRuntimeBootstrap({...shared,administrativeAgentReadiness:{checkCredential:agent.checkCredential}});
// @ts-expect-error Serialized metadata cannot replace an original checker.
createSharedRuntimeBootstrap({...shared,administrativeAgentReadiness:{...agent,checkModelAvailability:'JSON'}});
