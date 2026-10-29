import 'server-only';

type Provider={enabled:unknown;adapter:unknown;credential_env:unknown};
export async function validateGenerationModel(identifier:string,provider:Provider){
 if(!/^[a-zA-Z0-9._-]{1,100}$/.test(identifier))throw Error('Enter a valid model ID, up to 100 characters.');
 if(!provider.enabled||provider.adapter!=='gemini')throw Error('Choose an available Google provider.');
 if(!['GEMINI_API_KEY','GOOGLE_API_KEY'].includes(String(provider.credential_env)))throw Error('The provider credential is not configured.');
 const key=process.env[String(provider.credential_env)];if(!key)throw Error('The provider credential is not configured.');
 let response:Response;
 try{response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(identifier),{headers:{'x-goog-api-key':key},cache:'no-store',signal:AbortSignal.timeout(10000)});}
 catch{throw Error('Could not verify this model with Google. Try again.');}
 if(response.status===404)throw Error('Google did not find this model. Check the model ID.');
 if(response.status===401||response.status===403)throw Error('Google could not verify this model with the configured credential.');
 if(response.status===429)throw Error('Google verification is temporarily rate limited. Try again shortly.');
 if(!response.ok)throw Error('Could not verify this model with Google. Try again.');
 let metadata:{name?:string;supportedGenerationMethods?:unknown};try{metadata=await response.json();}catch{throw Error('Google returned an invalid model description. Try again.');}
 if(metadata.name!=='models/'+identifier||!Array.isArray(metadata.supportedGenerationMethods)||!metadata.supportedGenerationMethods.includes('generateContent'))throw Error('This model does not support activity generation.');
}
