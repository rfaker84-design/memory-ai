import OpenAI from "openai";

import { createLazyClient } from "./lazy-client";

const LazyOpenAI = new Proxy(OpenAI, {
  construct(Target, argumentsList) {
    return createLazyClient(
      () => Reflect.construct(Target, argumentsList) as OpenAI
    );
  },
});

export default LazyOpenAI as typeof OpenAI;
