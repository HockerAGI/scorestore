'use client';

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET() {
    try {
        const { data: siteConfig, error: siteConfigError } = await supabase
            .from('site_settings')
            .select('*')
            .single();

        const { data: contactInfo, error: contactInfoError } = await supabase
            .from('contact_info')
            .select('*')
            .single();

        if (siteConfigError || contactInfoError) {
            return NextResponse.json({ error: siteConfigError || contactInfoError }, { status: 500 });
        }

        const responseData = {
            siteConfig,
            contactInfo,
        };

        return NextResponse.json(responseData, { status: 200 });
    } catch (error) {
        return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
    }
}
