const fs = require('fs');
const path = require('path');

const prismaIndexPath = path.join(__dirname, '..', 'node_modules', 'prisma', 'build', 'index.js');

if (fs.existsSync(prismaIndexPath)) {
  const content = fs.readFileSync(prismaIndexPath, 'utf-8');
  const target = 'var CSe=require("util");';
  const replacement = 'var CSe=require("util");if(!CSe.isError){CSe.isError=(e)=>e instanceof Error||Object.prototype.toString.call(e)==="[object Error]";}';
  if (content.includes(target)) {
    fs.writeFileSync(prismaIndexPath, content.replace(target, replacement), 'utf-8');
    console.log('✔ Patched Prisma CLI for Node 24 compatibility (util.isError polyfill).');
  }
}
