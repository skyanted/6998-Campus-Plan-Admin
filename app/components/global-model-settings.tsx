import type {GlobalModel,Row} from '@/lib/week7';

export default function GlobalModelSettings({settings,models}:{settings:GlobalModel;models:Row[]}){
 const name=String(models.find(model=>model.id===settings.model_id)?.name??settings.identifier);
 return <section className="panel current-model-bar" aria-label="Current generation model">
  <div className="current-model-label"><span>Current model in use</span><small>Campus plans &amp; Admin</small></div>
  <div className="current-model-identity"><strong>{name}</strong>{name!==settings.identifier&&<code>{settings.identifier}</code>}<span className="current-model-provider">{settings.provider}</span></div>
 </section>;
}
