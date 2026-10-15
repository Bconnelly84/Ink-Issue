
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://govwqyxzqkdtkcevbgsp.supabase.co/rest/v1/';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_as50SkufjzJJc8QKft3Wdw_yY9oZ0YF';

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);
