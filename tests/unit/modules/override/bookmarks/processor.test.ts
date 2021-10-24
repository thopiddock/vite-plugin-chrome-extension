import { OverrideBookmarksProcessor } from "@/modules/override";
import { expect } from "chai";
import usecases from "./processor.usecase";

describe("OverrideBookmarksProcessor", () => {
    describe("normalizeOptions", () => {
        usecases.normalizeOptions.forEach(usecase => it(usecase.description, () => {
            const processor = new OverrideBookmarksProcessor(usecase.input);
            const normalizedOptions = (processor as any).normalizeOptions(usecase.input);
            expect(normalizedOptions).to.deep.equals(usecase.output);
        }));
    });
    describe("resolve", () => {
        usecases.resolve.forEach(usecase => it(usecase.description, () => {
            const processor = new OverrideBookmarksProcessor();
            processor.resolve(usecase.input);
            expect((processor as any)._cache.entry).to.be.equals(usecase.output);
        }));
    });
    describe("build", () => {
        usecases.build.forEach(usecase => it(usecase.description, async () => {
            const processor = new OverrideBookmarksProcessor();
            (processor as any)._cache.entry = usecase.input.entry;
            (processor as any)._cache.module = usecase.input.module;
            const module = await processor.build();
            expect((processor as any)._cache.module).to.be.deep.equals(usecase.output);
            expect(module).to.be.deep.equals(usecase.output);
        }));
    });
});