import { queryOptions } from "@tanstack/react-query";
import { getCollection } from "./collection.functions";
export const collectionOptions = () =>
  queryOptions({ queryKey: ["collection"], queryFn: () => getCollection() });
