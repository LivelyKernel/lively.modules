/*global System, beforeEach, afterEach, describe, it*/

import { expect } from "mocha-es6";
import { removeDir, createFiles, inspect as i } from "./helpers.js";

import { getSystem, removeSystem } from "../src/system.js";
import module from "../src/module.js";
import { registerPackage } from "../src/packages.js";

var dir = System.decanonicalize("lively.modules/tests/"),
    testProjectDir = dir + "test-project-dir/",
    testProjectSpec = {
      "file1.js": "import { y } from './file2.js'; export var x = y + 2;",
      "file2.js": "export var y = 1;",
      "file3.js": "var zzz = 4; System.global.z = zzz / 2;",
      "file4.js": "export default class Foo { static bar() {} }; Foo.bar();",
      "package.json": JSON.stringify({
                        "name": "test-project-1",
                        "main": "file1.js",
                        "systemjs": {"meta": {"file3.js": {format: "global", exports: "z"}}}
                      })
    }


describe("instrumentation", () => {

  let S, module1, module2, module3, module4;
  beforeEach(async () => {
    S = getSystem("test", {baseURL: dir});
    module1 = module(S, testProjectDir + "file1.js");
    module2 = module(S, testProjectDir + "file2.js");
    module3 = module(S, testProjectDir + "file3.js");
    module4 = module(S, testProjectDir + "file4.js");
    try { delete S.global.z; } catch (e) {}
    try { delete S.global.zzz; } catch (e) {}
    await createFiles(testProjectDir, testProjectSpec);
    await S.import(testProjectDir + "file1.js")
  });

  afterEach(async () => {
    removeSystem("test");
    await removeDir(testProjectDir);
  });

  it("gets access to internal module state", async () => {
    expect(module1).to.have.deep.property("recorder.y", 1);
    expect(module1).to.have.deep.property("recorder.x", 3);
  });

  it("modules can (re)define captures", async () => {
    module1.define("y", 2);
    expect(module1.recorder).to.have.property("y", 2);
    module1.define("newVar", 3);
    expect(module1.recorder).to.have.property("newVar", 3);
  });

  it("modules can undefine captures", async () => {
    module1.undefine("y");
    expect(module1.recorder).to.not.have.property("y");
    expect(module1.recorder).to.have.property("x", 3);
  });

  describe("of global modules", () => {

    it("can access local state", () => 
      S.import(`${testProjectDir}file3.js`)
        .then(() => {
          expect(module3).to.have.deep.property("recorder.zzz", 4);
          expect(S.get(testProjectDir + "file3.js")).to.have.property("z", 2);
        }))

  });

  describe("classes", function() {

    it("class export is recorded", async () => {
      var exports = await S.import(`${testProjectDir}file4.js`);
      expect(exports.default).is.a("function");
      expect(module4).to.have.deep.property("recorder.Foo");
      expect(exports.default).to.equal(module4.recorder.Foo);
    });

    it("classes have module meta data", async () => {
      await registerPackage(S, testProjectDir);
      var exports = await S.import(`${testProjectDir}file4.js`),
          Foo = module4.recorder.Foo;
      expect(Foo[Symbol.for("lively-instance-superclass")]).equals(Object)
      expect(Foo[Symbol.for("lively-instance-module-meta")]).deep.equals({
        package: {
          name: "test-project-1",
          version: undefined
        },
        pathInPackage: "./file4.js"
      });
    });

    it("in mutually dependend modules", async () => {
      await createFiles(testProjectDir, {
        "a.js": "import { Bar } from './b.js'; export class Foo { test() { return 'Foo'; } };",
        "b.js": "import { Foo } from './a.js'; export class Bar extends Foo { test() { return super.test() + 'Bar'; } };",
      });
      var { Foo } = await S.import(`${testProjectDir}a.js`),
          { Bar } = await S.import(`${testProjectDir}b.js`);
      expect(Bar[Symbol.for("lively-instance-superclass")]).equals(Foo);
      expect(new Bar().test()).equals("FooBar");
    });

  });

});
