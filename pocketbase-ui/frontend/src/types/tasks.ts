export interface TaskField {
    key: string;
    title: string;
    type: string;
    width: string;
    filterable: boolean;
    order: number;
}

export interface Status {
    title: string;
    slug: string;
    color: string;
}

export interface User {
    id: string;
    name: string;
    email: string;
}

export type Task = Record<string, any> & {
    source_file_date?: string;
    source_file_id?: string;
};
