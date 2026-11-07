import path from 'node:path';
import { fixture } from '../tests/fixture.js';
import { buildRoadmap } from '../src/build.js';
import { root } from '../src/store.js';
const {inputs,roadmap}=fixture(path.join(root,'demo-output'));
const result=await buildRoadmap({id:'demo-fixture',answers:inputs,roadmap,review:null});
console.log(JSON.stringify(result,null,2));
