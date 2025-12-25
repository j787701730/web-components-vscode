export type IComponentsTags = {
  [key: string]: {
    description: string;
    attributes: {
      [key: string]: {
        description: string;
        type: string;
        values: (string | number)[];
      };
    };
  };
};
