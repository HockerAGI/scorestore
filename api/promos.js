// api/promos.js

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'YOUR_SUPABASE_URL';
const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const getActivePromos = async () => {
    try {
        const { data, error } = await supabase
            .from('promotions')
            .select('*')
            .eq('active', true);

        if (error) throw error;

        return data || [];
    } catch (error) {
        console.error('Error fetching active promotions:', error);
        return [];
    }
};
