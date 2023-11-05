type VectorSearchResponse = {
  results: {
    id: string;
    version: number;
    score: number;
    payload: {
      keywords: string[];
      kinds: string[];
      page_id: string;
      question: string;
      scrapboxUrl: string;
      sourceUrl: string;
      updatedAt: number;
    };
    vector: any;
  }[];
};
