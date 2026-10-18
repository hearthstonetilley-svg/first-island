import { sampleHeight, WorldData } from '../world/generate';
import { Ground } from './navigation';
import { Random } from './random';
import { daylightAt } from './daylight';
import { MATING_DISTANCE, reproductionBlockers, reproductionDiagnostics } from './reproduction';
import { Activity, Agent, DeathCause, Dials, Environment, Plant, PopulationStats, SimEvent, Traits, Tree } from './types';
interface Body extends Agent { node: number; path: number[]; goal: number; food: number; cooldown: number; decision: number }
const clamp=(x:number,min=0,max=100)=>Math.max(min,Math.min(max,x));
const distance=(a:{x:number;z:number},b:{x:number;z:number})=>Math.hypot(a.x-b.x,a.z-b.z);

export class Bodies {
  readonly ground: Ground;
  readonly plants: Plant[]=[];
  readonly trees: Tree[]=[];
  readonly agents: Body[]=[];
  readonly environment: Environment={daylight:1,rain:0,temperature:0.9};
  readonly stats: PopulationStats={population:0,births:0,deaths:0,deathsByCause:{starvation:0,exposure:0,'old age':0,exhaustion:0}};
  private readonly random: Random;
  private readonly plantNodes:number[]=[];
  private readonly cover:number[];
  private nextId=1;
  constructor(readonly world:WorldData,dials:Dials,private readonly emit:(type:SimEvent['type'],data:SimEvent['data'])=>void){
    this.random=new Random(world.seed ^ 0x58a7d31);
    this.ground=new Ground(world);
    const plant=(node:number,tree:boolean,nutrition:number)=>{
      const n=this.ground.nodes[node];this.plantNodes.push(node);
      this.plants.push({id:this.plants.length,x:n.x,y:n.y,z:n.z,nutrition,quantity:tree?5:3,capacity:tree?5:3,regrowth:tree?0.0025:0.004,tree});
    };
    const treeNodes=new Map<number,number>();
    for(const tree of world.trees){
      const node=this.ground.nearest(tree.x,tree.z);
      if(distance(tree,this.ground.nodes[node])<1.3&&!treeNodes.has(node)){
        treeNodes.set(node,this.plants.length);plant(node,true,0.8+this.random.next()*0.4);
      }
      this.trees.push({...tree,id:this.trees.length,foodId:distance(tree,this.ground.nodes[node])<1.3?treeNodes.get(node)??null:null});
    }
    for(const node of this.ground.habitable){
      if(!this.ground.nodes[node].cover&&this.random.next()<0.16)plant(node,false,0.7+this.random.next()*0.4);
    }
    this.cover=this.ground.habitable.filter(id=>this.ground.nodes[id].cover);
    for(let i=0;i<dials.startingPopulation;i++){
      const node=this.ground.habitable[Math.floor(this.random.next()*this.ground.habitable.length)];
      const traits:Traits={speed:0.8+this.random.next()*0.4,strength:0.8+this.random.next()*0.4,perception:5+this.random.next()*4,
        curiosity:0.2+this.random.next()*0.7,sociability:0.3+this.random.next()*0.6,fertility:0.8+this.random.next()*0.4,lifespan:2.5+this.random.next()*0.5};
      const body=this.birth(node,traits,[],i+1,1,0);
      // Founders are young adults, with staggered ages to avoid synchronized death.
      body.biologicalAge=0.65+this.random.next()*0.35;
      body.age=Math.round(body.biologicalAge*dials.generationSeconds);
    }
  }
  private birth(node:number,traits:Traits,parents:number[],family:number,generation:number,tick:number):Body{
    const n=this.ground.nodes[node];
    const body:Body={id:this.nextId++,family,parents:[...parents],generation,bornTick:tick,age:0,biologicalAge:0,x:n.x,y:n.y,z:n.z,
      energy:85,warmth:80,rest:90,health:100,activity:'wandering',traits:{...traits},node,path:[],goal:node,food:-1,cooldown:0,decision:0};
    this.agents.push(body);this.stats.births++;this.stats.population++;
    this.emit('birth',{id:body.id,parents:body.parents,family,generation,traits:body.traits});return body;
  }
  private eligible(a:Body):boolean{return reproductionBlockers(a)===0;}
  reproductionDiagnostics(){return reproductionDiagnostics(this.agents);}
  private inherit(a:Traits,b:Traits,rate:number):Traits{
    const out={...a};
    const bounds:Record<keyof Traits,[number,number]>={speed:[0.5,2],strength:[0.5,2],perception:[2,15],curiosity:[0.05,1],sociability:[0.05,1],fertility:[0.3,2],lifespan:[2.5,3]};
    for(const key of Object.keys(out) as Array<keyof Traits>){
      const mean=(a[key]+b[key])/2;
      out[key]=clamp(mean+(this.random.next()*2-1)*rate*(key==='curiosity'||key==='sociability'?1:mean),...bounds[key]);
    }
    return out;
  }
  private route(a:Body,node:number,activity:Activity):void{
    a.activity=activity;
    if(a.goal!==node||a.path.length===0){
      // Return to the last reached node before taking a different graph edge.
      a.path=[a.node,...this.ground.path(a.node,node)];a.goal=node;
    }
  }
  private decide(a:Body,tick:number,dials:Dials):void{
    const cold=a.warmth<35;
    if(cold&&this.cover.length){this.route(a,this.ground.nearest(a.x,a.z,this.cover),'seeking cover');return;}
    if(a.rest<50||(a.activity==='resting'&&a.rest<90)||cold){a.activity='resting';a.path=[];return;}
    if(a.energy<75||(a.activity==='eating'&&a.energy<94)){
      let best=-1,score=Infinity;
      for(let p=0;p<this.plants.length;p++){
        const plant=this.plants[p];if(plant.quantity<0.05||plant.nutrition<=0)continue;
        const d=distance(a,plant);if(d>a.traits.perception)continue;
        const value=d/(plant.nutrition*Math.min(plant.quantity,1));if(value<score){best=p;score=value;}
      }
      if(best>=0){a.food=best;this.route(a,this.plantNodes[best],'seeking food');return;}
    }
    if(this.stats.population<dials.populationCap&&this.eligible(a)){
      // Approach a healthy adult that can actually reproduce, within perception.
      // Ordinary grouping below still includes children and elders.
      let mate:Body|undefined,near=a.traits.perception;
      for(const other of this.agents){
        if(other===a||!this.eligible(other))continue;
        const d=distance(a,other);if(d<near){mate=other;near=d;}
      }
      if(mate){this.route(a,mate.node,'socialising');return;}
    }
    if(this.random.next()<a.traits.sociability){
      let partner:Body|undefined,near=Infinity;
      for(const other of this.agents){if(other===a||other.health<=0)continue;const d=distance(a,other);if(d<near&&d<a.traits.perception){partner=other;near=d;}}
      if(partner){this.route(a,partner.node,'socialising');return;}
    }
    if(a.path.length&&a.activity==='wandering')return;
    const local=this.ground.habitable.filter(node=>distance(a,this.ground.nodes[node])<2+a.traits.curiosity*8);
    const node=local[Math.floor(this.random.next()*local.length)]??a.node;
    this.route(a,node,'wandering');
    a.decision=tick+20+Math.floor(this.random.next()*20);
  }
  step(dials:Dials,tick:number):void{
    const rate=1800/dials.generationSeconds;
    const day=daylightAt(tick,dials.generationSeconds);
    if(tick%Math.max(1,Math.round(dials.generationSeconds/10))===0)this.environment.rain=this.random.next()<0.35?0.3+this.random.next()*0.7:0;
    Object.assign(this.environment,{daylight:day,temperature:0.25+day*0.65-this.environment.rain*0.2});
    for(const plant of this.plants)plant.quantity=Math.min(plant.capacity,plant.quantity+plant.regrowth*dials.foodRegrowth*rate);
    const aliveAtStart=[...this.agents];
    for(const a of aliveAtStart){
      a.age++;a.biologicalAge+=1/dials.generationSeconds;a.cooldown-=1/dials.generationSeconds;
      const resting=a.activity==='resting'||(a.activity==='seeking cover'&&a.path.length===0);
      const sheltered=this.ground.nodes[a.node].cover&&resting;
      a.energy=clamp(a.energy-(0.044+0.006*a.traits.strength+(a.path.length?0.012*a.traits.speed:0))*rate);
      a.rest=clamp(a.rest+(resting?0.28:-0.028)*rate);
      const thermal=(this.environment.temperature-0.48)*0.16-this.environment.rain*(sheltered?0.004:0.045);
      a.warmth=clamp(a.warmth+(thermal+(sheltered?0.065:0))*rate);
      const damage=(a.energy===0?0.5:0)+(a.warmth===0?0.4:0)+(a.rest===0?0.15:0)+(a.biologicalAge>a.traits.lifespan?2:0);
      a.health=clamp(a.health+(damage>0?-damage/a.traits.strength:a.energy>30&&a.warmth>25&&a.rest>20?0.08:0)*rate);
      if(a.health===0){
        const cause:DeathCause=a.biologicalAge>a.traits.lifespan?'old age':a.energy===0?'starvation':a.warmth===0?'exposure':'exhaustion';
        this.stats.deaths++;this.stats.deathsByCause[cause]++;this.stats.population--;
        this.emit('death',{id:a.id,cause,age:a.age,generation:a.generation});continue;
      }
      if(tick>=a.decision){this.decide(a,tick,dials);a.decision=tick+15;}
      if(a.activity==='seeking food'&&a.food>=0&&distance(a,this.plants[a.food])<0.28){
        const plant=this.plants[a.food],portion=Math.min(plant.quantity,0.25*rate);
        plant.quantity-=portion;a.energy=clamp(a.energy+portion*plant.nutrition*30);a.activity='eating';a.path=[];
        if(plant.quantity<0.05)a.decision=tick+1;
      } else if(a.activity==='eating') {
        a.decision=tick; // Continue eating on the next decision if still hungry.
      }
      let movement=0.065*a.traits.speed*rate;
      while(a.path.length&&movement>0){
        const node=a.path[0],n=this.ground.nodes[node],d=distance(a,n);
        if(d<=movement){a.x=n.x;a.z=n.z;a.node=node;a.path.shift();movement-=d;}
        else{a.x+=(n.x-a.x)/d*movement;a.z+=(n.z-a.z)/d*movement;movement=0;}
      }
      a.y=sampleHeight(this.world,a.x,a.z);
      if(a.activity==='seeking cover'&&a.path.length===0)a.activity='resting';
      if(this.eligible(a)&&this.stats.population<dials.populationCap){
        const partner=this.agents.find(b=>b.id>a.id&&this.eligible(b)&&distance(a,b)<MATING_DISTANCE);
        if(partner&&this.random.next()<0.003*a.traits.fertility*partner.traits.fertility*rate){
          a.cooldown=partner.cooldown=0.22;a.energy-=12;partner.energy-=12;
          const child=this.birth(a.node,this.inherit(a.traits,partner.traits,dials.mutationRate),[a.id,partner.id],this.random.next()<0.5?a.family:partner.family,Math.max(a.generation,partner.generation)+1,tick);
          this.emit('reproduction',{parents:[a.id,partner.id],child:child.id,parentAges:[a.age,partner.age],parentBiologicalAges:[a.biologicalAge,partner.biologicalAge]});
        }
      }
    }
    for(let i=this.agents.length-1;i>=0;i--)if(this.agents[i].health===0)this.agents.splice(i,1);
  }
  /** All mutable state, including future-affecting internals omitted from render snapshots. */
  state(){
    return structuredClone({agents:this.agents,plants:this.plants,trees:this.trees,environment:this.environment,
      stats:this.stats,random:this.random.snapshot(),nextId:this.nextId});
  }
  snapshotAgents():Agent[]{
    return this.agents.map(({node:_node,path:_path,goal:_goal,food:_food,cooldown:_cooldown,decision:_decision,...a})=>({...a,parents:[...a.parents],traits:{...a.traits}}));
  }
}
