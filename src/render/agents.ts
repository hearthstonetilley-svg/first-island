import { Color, CylinderGeometry, InstancedMesh, Matrix4, Mesh, Object3D, PerspectiveCamera, Raycaster, RingGeometry, Scene, SphereGeometry, Vector2, Vector3 } from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { Activity, Agent, Snapshot } from '../sim/types';
import { SnapshotBuffer } from './snapshots';

const ACTIVITIES: Record<Activity,string>={wandering:'#f5f5df','seeking food':'#ffcf62',eating:'#ffad32',resting:'#81c7ef','seeking cover':'#c7a3ff',socialising:'#f3a6ca'};
export class AgentFigures {
  private readonly buffer=new SnapshotBuffer();
  private readonly torso:InstancedMesh;
  private readonly heads:InstancedMesh;
  private readonly legs:InstancedMesh;
  private readonly arms:InstancedMesh;
  private readonly cues:InstancedMesh;
  private readonly selection:Mesh;
  private readonly transform=new Object3D();
  private readonly matrix=new Matrix4();
  private readonly tint=new Color();
  private readonly ray=new Raycaster();
  private readonly pointer=new Vector2();
  private agents:Agent[]=[];
  private readonly capacity=1000;
  selected:number|undefined;
  /** Sandbox view: larger figures, each in its agent's own colour. */
  scale=1;
  colours:string[]|undefined;
  private paused=false;
  constructor(private readonly scene:Scene,initial?:Snapshot){
    const material=new MeshStandardNodeMaterial({color:'#ffffff',roughness:0.85});
    const skin=new MeshStandardNodeMaterial({color:'#f4e4bc',roughness:0.8});
    const dark=new MeshStandardNodeMaterial({color:'#263646',roughness:0.9});
    const cueMaterial=new MeshStandardNodeMaterial({color:'#ffffff',emissive:'#555555',emissiveIntensity:0.2});
    this.torso=new InstancedMesh(new CylinderGeometry(0.105,0.14,0.32,6),material,this.capacity);
    this.heads=new InstancedMesh(new SphereGeometry(0.105,8,6),skin,this.capacity);
    this.legs=new InstancedMesh(new CylinderGeometry(0.045,0.04,0.26,5),dark,this.capacity*2);
    this.arms=new InstancedMesh(new CylinderGeometry(0.035,0.03,0.26,5),material,this.capacity*2);
    this.cues=new InstancedMesh(new SphereGeometry(0.045,6,4),cueMaterial,this.capacity);
    const selectionMaterial=new MeshStandardNodeMaterial({color:'#fff0b4',emissive:'#edc56a',emissiveIntensity:0.4,side:2});
    this.selection=new Mesh(new RingGeometry(0.23,0.28,24),selectionMaterial);
    this.selection.rotation.x=-Math.PI/2;this.selection.visible=false;
    for(const mesh of [this.torso,this.heads,this.legs,this.arms,this.cues]){
      mesh.userData.agentFigure=true;mesh.count=0;mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);
    }
    scene.add(this.selection);
    if(initial)this.receive(initial,0);
    this.update(0,0);
  }
  receive(snapshot:Snapshot,timestamp:number):void{this.buffer.receive(snapshot,timestamp);this.paused=snapshot.speed===0;}
  update(timestamp:number,animationSeconds:number):Agent[]{
    this.agents=this.buffer.sample(timestamp).slice(0,this.capacity);
    this.torso.count=this.heads.count=this.cues.count=this.agents.length;
    this.legs.count=this.arms.count=this.agents.length*2;
    this.selection.visible=false;
    for(let i=0;i<this.agents.length;i++){
      const a=this.agents[i];
      const growth=0.55+Math.min(1,a.biologicalAge/0.3)*0.45;
      const resting=a.activity==='resting',s= growth*(resting?0.8:1)*this.scale;
      const height=resting?0.6:1;
      const moving=['wandering','seeking food','seeking cover','socialising'].includes(a.activity);
      const stride=moving&&!this.paused?Math.sin(animationSeconds*7+a.id)*0.13:0;
      const put=(mesh:InstancedMesh,index:number,x:number,y:number,z:number,rx=0)=>{
        this.transform.position.set(a.x+x*s,a.y+0.025+y*s*height,a.z+z*s);
        this.transform.rotation.set(rx,0,0);this.transform.scale.set(s,s*height,s);this.transform.updateMatrix();
        this.matrix.copy(this.transform.matrix);mesh.setMatrixAt(index,this.matrix);
      };
      put(this.torso,i,0,0.43,0,a.activity==='eating'?0.2:0);
      put(this.heads,i,0,0.72,0);
      put(this.legs,i*2,-0.065,0.16,stride,stride);
      put(this.legs,i*2+1,0.065,0.16,-stride,-stride);
      put(this.arms,i*2,-0.16,0.43,-stride,-stride);
      put(this.arms,i*2+1,0.16,0.43,stride,stride);
      put(this.cues,i,0,0.93,0);
      if(this.colours)this.tint.set(this.colours[a.id%this.colours.length]);else this.tint.setHSL((a.family*0.61803398875)%1,0.72,0.64);
      this.torso.setColorAt(i,this.tint);this.arms.setColorAt(i*2,this.tint);this.arms.setColorAt(i*2+1,this.tint);
      this.cues.setColorAt(i,this.tint.set(ACTIVITIES[a.activity]));
      if(a.id===this.selected){this.selection.visible=true;this.selection.position.set(a.x,a.y+0.04,a.z);}
    }
    for(const mesh of [this.torso,this.heads,this.legs,this.arms,this.cues]){
      mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
    }
    return this.agents;
  }
  pick(clientX:number,clientY:number,canvas:HTMLCanvasElement,camera:PerspectiveCamera):number|undefined{
    const rect=canvas.getBoundingClientRect();
    this.pointer.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);
    this.ray.setFromCamera(this.pointer,camera);
    const meshes=[this.heads,this.torso,this.legs,this.arms];
    for(const mesh of meshes)mesh.computeBoundingSphere();
    const hit=this.ray.intersectObjects(meshes,false)[0];
    const blocker=this.ray.intersectObjects(this.scene.children.filter(object=>object instanceof Mesh&&!(object instanceof InstancedMesh)),false)[0];
    if(hit&&blocker&&blocker.distance<hit.distance-0.1)return undefined;
    if(hit?.instanceId!==undefined){
      const index=hit.object===this.legs||hit.object===this.arms?Math.floor(hit.instanceId/2):hit.instanceId;
      return this.agents[index]?.id;
    }
    return undefined;
  }
  projected(camera:PerspectiveCamera):Array<{id:number;x:number;y:number;visible:boolean}>{
    return this.agents.map(a=>{
      const p=new Vector3(a.x,a.y+0.95*this.scale,a.z).project(camera);
      return {id:a.id,x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2,visible:p.z>=-1&&p.z<=1&&Math.abs(p.x)<=1&&Math.abs(p.y)<=1};
    });
  }
  dispose():void{for(const mesh of [this.torso,this.heads,this.legs,this.arms,this.cues])mesh.dispose();}
}
