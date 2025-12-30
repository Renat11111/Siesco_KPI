import { RecordModel } from 'pocketbase';

export interface BitrixUser extends RecordModel {
    bitrix_id: number;
    full_name: string;
}

export interface BitrixGroup extends RecordModel {
    bitrix_id: number;
    name: string;
}

export interface BitrixTask extends RecordModel {
    bitrix_id: number;
    title: string;
    description: string;
    status: number;
    priority: number;
    deadline: string;
    created_date: string;
    responsible: string; 
    group: string;
    comments_count: number;
    expand?: {
        responsible?: BitrixUser;
        group?: BitrixGroup;
    };
}
