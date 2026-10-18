# Fourth adversarial audit by GPT-6-Astra, 18 Oct 2026 (commit c295e6a)

Run visibly in the island tmux window `audit`, read-only.

```
  changed.                                                                                                                   
  TypeScript checking passed; all 30 prediction assertions passed in an in-memory harness. I also ran isolated council,      
  cancellation and recovery reproductions. The supplied 44/44 eval and 640 px screenshot were inspected, not regenerated.    
   Ranked defect                          Status                                         Evidence                            
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   1. Council failure duplicates          Fixed for the reported failure                 Primitive item validation and       
   inventory                                                                             Promise.allSettled prevent the      
                                                                                         malformed part from racing cleanup. 
                                                                                         Reproduction preserved inventory    
                                                                                         accounting, with no part emitted    
                                                                                         after closure. server/              
                                                                                         sandbox.ts:528, cleanup:580         
                                                                                         (server/sandbox.ts:580).            
  ─────────────────────────────────────  ─────────────────────────────────────────────  ─────────────────────────────────────
   2. Unattended starvation               Fixed                                          Movement and pressure now share the 
                                                                                         scheduler’s running-and-viewer      
 
                                                                                         gate. Pending replies can still     
                                                                                         finish without viewers, but the     
                                                                                         reported starvation mechanism is    
                                                                                         removed. server/sandbox.ts:625.     
   3. Collapsed agents act or join        Fixed                                          Collapse increments mindEpoch;      
   councils                                                                              completion checks both epoch and    
                                                                                         collapse state. Recruitment         
                                                                                         excludes collapsed agents. server/  
                                                                                         sandbox.ts:134, 434 (server/        
                                                                                         sandbox.ts:434), 490 (server/       
                                                                                         sandbox.ts:490).                    
   4. Pause permits queued council        Fixed for spending; partly for cancellation    A queued slot rejected the old      
   spending                                                                              epoch after Pause/Run. However, a   
                                                                                         pending part still emits            
                                                                                         council_part while paused: its      
                                                                                         guard checks closure, not           
                                                                                         cancellation. server/               
                                                                                         sandbox.ts:369, 480 (server/        
                                                                                         sandbox.ts:480), 549 (server/       
                                                                                         sandbox.ts:549).                    
   5. Unsound prediction marks            Partly                                         All three reported examples pass.   
                                                                                         But cord: not fire still becomes    
                                                                                         not cord, incorrectly marking       
                                                                                         actual cord wrong. Punctuation      
                                                                                         filtering leaves the same ambiguity 
                                                                                         through another separator. src/     
                                                                                         sandbox/hypothesis.ts:31, 45 (src/  
                                                                                         sandbox/hypothesis.ts:45).          
   6. Pause advances pressure time        Fixed within a running process                 Daylight, storms and recovery use   
                                                                                         accumulated simulation time.        
                                                                                         Persistence introduces the          
                                                                                         regression below. server/           
                                                                                         sandbox.ts:109, 625 (server/        
                                                                                         sandbox.ts:625).                    
  The additional required items:                                                                                             
   Required item                                     Status                   Evidence                                       
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Prediction accounting                             Fixed; parsing partly    Missing attempts remain counted and displayed. 
                                                                              server/sandbox.ts:234, src/sandbox/            
                                                                              main.ts:188.                                   
  ────────────────────────────────────────────────  ───────────────────────  ────────────────────────────────────────────────
   Council fallback predictions                      Fixed                    Normal fallback explicitly predicts nothing.   
                                                                              server/sandbox.ts:536.                         
   Validated council/skill payloads and              Partly                   Reported cleanup race fixed; skill steps, plan 
   guaranteed cleanup                                                         fields and merge fields still coerce arbitrary 
                                                                              objects with String(...), permitting avoidable 
                                                                              exceptions and aborted work. server/           
                                                                              sandbox.ts:150, 509 (server/sandbox.ts:509),   
                                                                              562 (server/sandbox.ts:562).                   
   Pause checks across every await                   Partly                   Spending and combinations guarded; part        
                                                                              publication remains unguarded as above.        
   Stable fact coordinates                           Fixed                    Coordinates depend on fact ID, not total       
                                                                              count. src/sandbox/web.ts:55.                  
   Applied minimal quality in eval                   Fixed                    Debug reports applied quality; asynchronous    
                                                                              compilation has a request guard. src/sandbox/  
                                                                              main.ts:545, src/render/scene.ts:524.          
   Complete 640 px layout                            Partly verified          Supplied screenshot fits with a scrolling card 
                                                                              panel. Automated checks still omit             
                                                                              comprehensive child clipping and overlap.      
                                                                              scripts/eval-sandbox.mjs:173.                  
  New defects introduced, worst first:                                                                                       
  1. High: saved collapse deadlines outlive their clock. simMs resets to zero, while save/load preserves collapsedUntil. A   
     collapse at one simulated hour becomes another hour of unconsciousness after restart instead of roughly 20 seconds.     
     Older saves containing wall-clock deadlines can strand agents effectively indefinitely. Reproduced the one-hour case.   
     Persist the clock consistently or restore remaining recovery duration, with old-save handling. clock:109 (server/       
     sandbox.ts:109), save/load:593 (server/sandbox.ts:593).                                                                 
  2. Medium: the new conservation gate can falsely pass. Injection requires every third council’s first hand to contain at   
     least two items, but the eval never asserts injection occurred. Ledger checks skip whenever any council remains open,   
     and the pass/fail assertion runs before the later cancellation test. Thus “never duplicated or lost” exceeds what is    
     tested. injection:531 (server/sandbox.ts:531), ledger:95 (server/sandbox.ts:95), assertion:157 (scripts/eval-           
     sandbox.mjs:157).                                                                                                       
  Ready for the owner’s first supervised play test: no; first fix recovery across reloads and reject ambiguous multi-outcome 
  predictions, then verify those two regressions.                                                                            

```
