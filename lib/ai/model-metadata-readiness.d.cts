export interface ModelMetadataBinding {runtimeId:string;providerId:string;credentialRef:string;model:string;signal?:AbortSignal}
export interface ModelMetadataObservation {runtimeId:string;providerId:string;credentialRef:string;requestedModel:string;resolvedModel:string;exactModelMatch:boolean;metadataAccessible:true;selectionUnchanged:true;generationVerified:false;budgetVerified:false}
export type ModelMetadataChecker=(context:Readonly<ModelMetadataBinding>)=>Promise<ModelMetadataObservation>;
export declare function checkModelMetadata(check:ModelMetadataChecker,binding:ModelMetadataBinding):Promise<Readonly<ModelMetadataObservation>>;
