import { Agent, Snapshot } from '../sim/types';

export class AgentInspector {
  readonly element=document.createElement('section');
  readonly chooser=document.createElement('select');
  selected:number|undefined;
  following=false;
  private snapshot:Snapshot|undefined;
  private ids='';
  private last:Agent|undefined;
  constructor(parent:HTMLElement,chooserParent:HTMLElement,private readonly highlight:(id:number|undefined)=>void,
    private readonly follow:(id:number|undefined)=>void,private readonly overview:()=>void){
    this.chooser.className='agent-chooser';this.chooser.setAttribute('aria-label','Inspect an agent');
    this.chooser.innerHTML='<option value="">Inspect an agent</option>';chooserParent.append(this.chooser);
    this.chooser.onchange=()=>this.select(this.chooser.value?Number(this.chooser.value):undefined);
    this.element.className='agent-panel';this.element.hidden=true;this.element.setAttribute('aria-label','Agent details');
    this.element.innerHTML=`<div class="agent-heading"><h2>Agent</h2><button type="button" class="agent-close" aria-label="Close agent details">×</button></div>
      <p class="agent-identity"></p><p class="agent-activity"></p>
      <div class="agent-needs">${['energy','warmth','rest','health'].map(need=>`<label>${need}<meter min="0" max="100" data-need="${need}"></meter><span data-value="${need}"></span></label>`).join('')}</div>
      <h3>Inherited traits</h3><dl class="agent-traits"></dl><p class="agent-parents"></p><p class="agent-age"></p>
      <button type="button" class="agent-follow" aria-pressed="false">Follow agent</button> <button type="button" class="agent-overview">Island view</button>
      <p class="agent-legend">Activity dot: white wandering, amber food, blue rest, violet cover, pink social.</p>`;
    parent.append(this.element);
    this.element.querySelector<HTMLButtonElement>('.agent-close')!.onclick=()=>this.select(undefined);
    this.element.querySelector<HTMLButtonElement>('.agent-follow')!.onclick=()=>{
      this.following=!this.following;this.follow(this.following?this.selected:undefined);this.render();
    };
    this.element.querySelector<HTMLButtonElement>('.agent-overview')!.onclick=()=>{this.following=false;this.overview();this.render();};
  }
  select(id:number|undefined):void{
    this.selected=id;this.last=undefined;this.element.hidden=id===undefined;
    this.highlight(id);this.chooser.value=id===undefined?'':String(id);
    if(this.following)this.follow(id);
    if(id===undefined){this.following=false;this.follow(undefined);}
    this.render();
  }
  update(snapshot:Snapshot):void{
    this.snapshot=snapshot;
    const ids=snapshot.agents.map(a=>a.id).join(',');
    if(ids!==this.ids){
      this.chooser.replaceChildren(new Option('Inspect an agent',''),...snapshot.agents.map(a=>new Option(`Agent ${a.id} · family ${a.family}`,String(a.id))));
      this.chooser.value=this.selected===undefined?'':String(this.selected);this.ids=ids;
    }
    this.render();
  }
  private render():void{
    if(this.selected===undefined||!this.snapshot)return;
    const a=this.snapshot.agents.find(agent=>agent.id===this.selected);
    if(a)this.last=a;
    const agent=a??this.last;if(!agent)return;
    this.element.querySelector('h2')!.textContent=`Agent ${agent.id}`;
    this.element.querySelector('.agent-identity')!.textContent=`Family ${agent.family} · lineage generation ${agent.generation}`;
    this.element.querySelector('.agent-activity')!.textContent=a?agent.activity:'Died · retained in the event log';
    for(const key of ['energy','warmth','rest','health'] as const){
      this.element.querySelector<HTMLMeterElement>(`[data-need="${key}"]`)!.value=agent[key];
      this.element.querySelector(`[data-value="${key}"]`)!.textContent=agent[key].toFixed(0);
    }
    const traits=this.element.querySelector('.agent-traits')!;
    traits.replaceChildren(...Object.entries(agent.traits).flatMap(([key,value])=>{
      const term=document.createElement('dt'),detail=document.createElement('dd');term.textContent=key==='perception'?'perception range':key;
      detail.textContent=`${value.toFixed(2)}${key==='lifespan'?' generations':key==='perception'?' units':''}`;return[term,detail];
    }));
    this.element.querySelector('.agent-parents')!.textContent=agent.parents.length?`Parents: ${agent.parents.map(id=>`#${id}`).join(' and ')}`:'Parents: founding agent';
    this.element.querySelector('.agent-age')!.textContent=`Age: ${agent.biologicalAge.toFixed(2)} generations · ${Math.floor(agent.age/60)}m ${agent.age%60}s`;
    const button=this.element.querySelector<HTMLButtonElement>('.agent-follow')!;
    if(!a&&this.following){this.following=false;this.follow(undefined);}
    button.disabled=!a;button.setAttribute('aria-pressed',String(this.following));button.textContent=this.following?'Stop following':'Follow agent';
  }
}
