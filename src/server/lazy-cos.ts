import COS from "cos-nodejs-sdk-v5";

import { createLazyClient } from "./lazy-client";

const LazyCOS = new Proxy(COS, {
  construct(Target, argumentsList) {
    return createLazyClient(
      () => Reflect.construct(Target, argumentsList) as COS
    );
  },
});

export default LazyCOS as typeof COS;
