import {createConfigurationValidator,createConfigurationService,type ConfigurationDependencies} from '../../lib/ai/configuration-service.cjs';
import {createConfigurationRuntimeBootstrap,type AdministrativeConfigurationDependencies} from '../../lib/ai/configuration-runtime-bootstrap.cjs';
import {createSharedRuntimeBootstrap,type SharedRuntimeDependencies} from '../../lib/ai/shared-runtime-bootstrap.cjs';
declare const configuration:ConfigurationDependencies;
declare const administrative:AdministrativeConfigurationDependencies;
declare const shared:SharedRuntimeDependencies;
const observeWeb=createConfigurationValidator(configuration,{runtimeId:'web'});
const assignments:Promise<unknown[]>=observeWeb({});
void assignments;
createConfigurationRuntimeBootstrap({...administrative,observationRuntimeId:'web'}).prepare().then(result=>{const scope:'all'|'runtime'=result.readiness.observationScope.kind;void scope;});
createSharedRuntimeBootstrap(shared);
// @ts-expect-error Public authenticated service has no reduced observation mode.
createConfigurationService({...configuration,observationRuntimeId:'web'});
// @ts-expect-error Shared web startup scope is fixed internally, not caller selectable.
createSharedRuntimeBootstrap({...shared,observationRuntimeId:'agent'});
