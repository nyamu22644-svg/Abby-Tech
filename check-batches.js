import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

// Load environment variables from .env.local
const envPath = path.join(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  envContent.split('\n').forEach(line => {
    if (line && !line.startsWith('#')) {
      const [key, value] = line.split('=')
      if (key && value) {
        process.env[key.trim()] = value.trim().replace(/^["']|["']$/g, '')
      }
    }
  })
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

async function checkBatches() {
  console.log('Checking egg_batches table...')
  
  // Check all batches
  const { data: allBatches, error: allError } = await supabase
    .from('egg_batches')
    .select('id, batch_number, status, deleted_at')
  
  if (allError) {
    console.error('Error fetching batches:', allError)
    return
  }
  
  console.log(`Total batches in table: ${allBatches?.length || 0}`)
  
  if (allBatches && allBatches.length > 0) {
    console.log('\nBatches found:')
    allBatches.forEach(b => {
      console.log(`  - ${b.batch_number} (ID: ${b.id}, Status: ${b.status}, Deleted: ${b.deleted_at ? 'YES' : 'NO'})`)
    })
  } else {
    console.log('✓ No batches found in database!')
  }
}

checkBatches().then(() => process.exit(0)).catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
