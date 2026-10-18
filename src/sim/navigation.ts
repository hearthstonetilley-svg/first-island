import { sampleHeight, sampleSlope, WorldData } from '../world/generate';
export interface GroundNode { x: number; y: number; z: number; neighbours: number[]; cover: boolean }

/** A connected ground graph. Edges are checked against the actual heightmap,
 * including their interiors, so movement cannot cross water or a steep gap. */
export class Ground {
  readonly nodes: GroundNode[] = [];
  readonly habitable: number[];
  constructor(readonly world: WorldData) {
    const cells = Math.ceil(world.size / 0.8);
    const grid = new Int32Array(cells * cells).fill(-1);
    const spacing = world.size / cells;
    const walkable = (x: number,z: number) => {
      const y=sampleHeight(world,x,z);
      return y>0.2 && y<5.5 && sampleSlope(world,x,z)<1.5;
    };
    for(let row=0;row<cells;row++)for(let col=0;col<cells;col++){
      const x=(col+0.5)*spacing-world.size/2,z=(row+0.5)*spacing-world.size/2;
      if(!walkable(x,z))continue;
      grid[row*cells+col]=this.nodes.length;
      this.nodes.push({x,y:sampleHeight(world,x,z),z,neighbours:[],cover:world.trees.some(t=>Math.hypot(t.x-x,t.z-z)<1.2)});
    }
    for(let row=0;row<cells;row++)for(let col=0;col<cells;col++){
      const id=grid[row*cells+col];if(id<0)continue;
      for(const [dr,dc] of [[0,1],[1,0]]){
        if(row+dr>=cells||col+dc>=cells)continue;
        const other=grid[(row+dr)*cells+col+dc];if(other<0)continue;
        const a=this.nodes[id],b=this.nodes[other];
        if([0.25,0.5,0.75].every(t=>walkable(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t))){a.neighbours.push(other);b.neighbours.push(id);}
      }
    }
    const visited=new Set<number>();let largest:number[]=[];
    for(let id=0;id<this.nodes.length;id++){
      if(visited.has(id))continue;
      const component=[id];visited.add(id);
      for(let i=0;i<component.length;i++)for(const next of this.nodes[component[i]].neighbours)if(!visited.has(next)){visited.add(next);component.push(next);}
      if(component.length>largest.length)largest=component;
    }
    if(largest.length<2)throw new Error('Seed has no connected habitable ground');
    this.habitable=largest;
  }
  nearest(x:number,z:number,candidates=this.habitable):number {
    let best=candidates[0],distance=Infinity;
    for(const id of candidates){const n=this.nodes[id],d=(n.x-x)**2+(n.z-z)**2;if(d<distance){best=id;distance=d;}}
    return best;
  }
  path(from:number,to:number):number[]{
    if(from===to)return [];
    const previous=new Int32Array(this.nodes.length).fill(-1),queue=[from];previous[from]=from;
    for(let i=0;i<queue.length;i++){
      for(const next of this.nodes[queue[i]].neighbours){
        if(previous[next]>=0)continue;
        previous[next]=queue[i];queue.push(next);
        if(next===to){const path=[to];while(previous[path[0]]!==from)path.unshift(previous[path[0]]);return path;}
      }
    }
    return [];
  }
}
