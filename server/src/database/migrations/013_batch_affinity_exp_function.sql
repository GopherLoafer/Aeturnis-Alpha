-- Batch Affinity Experience Award Function - Affinity Patch v1
-- Combines experience insert + tier update in single stored function

-- Drop function if exists
DROP FUNCTION IF EXISTS award_affinity_exp(uuid, uuid, bigint, varchar(50), varchar(10));

-- Create batch affinity experience award function
CREATE OR REPLACE FUNCTION award_affinity_exp(
  p_character_id uuid,
  p_affinity_id uuid,
  p_experience_amount bigint,
  p_source varchar(50) DEFAULT 'combat',
  p_session_id varchar(10) DEFAULT NULL
) RETURNS TABLE (
  character_affinity_id uuid,
  total_experience bigint,
  previous_tier integer,
  new_tier integer,
  tier_updated boolean
) AS $$
DECLARE
  v_character_affinity character_affinities%ROWTYPE;
  v_previous_tier integer;
  v_new_tier integer;
  v_tier_updated boolean := false;
BEGIN
  -- Get or create character affinity record
  SELECT * INTO v_character_affinity
  FROM character_affinities 
  WHERE character_id = p_character_id AND affinity_id = p_affinity_id;
  
  -- Store previous tier
  v_previous_tier := COALESCE(v_character_affinity.tier, 1);
  
  -- If character affinity doesn't exist, create it
  IF NOT FOUND THEN
    INSERT INTO character_affinities (character_id, affinity_id, experience, tier, updated_at)
    VALUES (p_character_id, p_affinity_id, p_experience_amount, 1, NOW())
    RETURNING * INTO v_character_affinity;
  ELSE
    -- Update existing record with new experience
    UPDATE character_affinities 
    SET experience = experience + p_experience_amount,
        updated_at = NOW()
    WHERE character_id = p_character_id AND affinity_id = p_affinity_id
    RETURNING * INTO v_character_affinity;
  END IF;
  
  -- Calculate new tier based on total experience
  v_new_tier := calculate_affinity_tier(v_character_affinity.experience);
  
  -- Update tier if it changed
  IF v_new_tier != v_previous_tier THEN
    UPDATE character_affinities 
    SET tier = v_new_tier,
        tier_updated_at = NOW()
    WHERE id = v_character_affinity.id;
    
    v_tier_updated := true;
  END IF;
  
  -- Log the experience award
  INSERT INTO affinity_experience_log (
    character_id,
    affinity_id,
    experience_awarded,
    source,
    session_id,
    previous_tier,
    new_tier,
    created_at
  ) VALUES (
    p_character_id,
    p_affinity_id,
    p_experience_amount,
    p_source,
    p_session_id,
    v_previous_tier,
    v_new_tier,
    NOW()
  );
  
  -- Return results
  RETURN QUERY SELECT 
    v_character_affinity.id,
    v_character_affinity.experience + p_experience_amount,
    v_previous_tier,
    v_new_tier,
    v_tier_updated;
    
END;
$$ LANGUAGE plpgsql;

-- Create index for performance optimization
CREATE INDEX IF NOT EXISTS idx_character_affinities_char_affinity 
ON character_affinities(character_id, affinity_id);

CREATE INDEX IF NOT EXISTS idx_affinity_exp_log_char_affinity_created 
ON affinity_experience_log(character_id, affinity_id, created_at DESC);

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION award_affinity_exp(uuid, uuid, bigint, varchar(50), varchar(10)) TO PUBLIC;