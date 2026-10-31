import {registerOriginalNativePlatformWebHostConfiguration,type OriginalNativePlatformWebHostConfiguration} from '../../lib/ai/platform-web-host-registration.cjs';
import {createOperationalWebDeployment,type OperationalWebDeploymentOptions} from '../../lib/ai/operational-deployment.cjs';
import {createOperationalWebComposition,type OperationalWebOptions} from '../../lib/ai/operational-composition.cjs';
import type {OriginalWebImageCapabilities,IdeogramSharedRuntimeDependencies} from '../../lib/ai/ideogram-shared-runtime.cjs';
declare const original:OriginalNativePlatformWebHostConfiguration;
declare const image:OriginalWebImageCapabilities;
declare const deployment:OperationalWebDeploymentOptions;
declare const composition:OperationalWebOptions;
declare const partialImage:IdeogramSharedRuntimeDependencies['image'];
registerOriginalNativePlatformWebHostConfiguration({...original,image},{prepareTimeoutMs:1000,stopTimeoutMs:100});
createOperationalWebDeployment({...deployment,runtime:{...deployment.runtime,image}});
createOperationalWebComposition({...composition,image});
// @ts-expect-error Native image selection requires original readiness and stop capabilities.
registerOriginalNativePlatformWebHostConfiguration({...original,image:partialImage},{prepareTimeoutMs:1000,stopTimeoutMs:100});
