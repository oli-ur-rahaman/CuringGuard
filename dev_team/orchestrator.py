import os
import sys
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Import our custom Agent Personas
from agents import AGENTS

def main():
    if len(sys.argv) < 2:
        print("Usage: python orchestrator.py \"Your task description here\"")
        print("Example: python orchestrator.py \"Design the db schema for Drawing Elements\"")
        sys.exit(1)
        
    user_prompt = sys.argv[1]
    
    load_dotenv()
    api_key = os.getenv("GOOGLE_API_KEY")
    
    if not api_key or "paste_your_key_here" in api_key:
        print("[ERROR] Invalid Google API Key!")
        print("Please paste your real GOOGLE_API_KEY into the d:/CuringGuard/dev_team/.env file.")
        sys.exit(1)
        
    client = genai.Client(api_key=api_key)
    
    print("\n[ORCHESTRATOR] Initializing Native Multi-Agent Dev Team")
    print(f"[TASK]: {user_prompt}\n")

    print("========================================")
    print("WAKING UP: @Architect")
    print("========================================")
    
    try:
        architect_response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=f"USER REQUEST: {user_prompt}\n\nPlease analyze this request and outline what the Geometry, Frontend, Backend, and QA specialists need to do.",
            config=types.GenerateContentConfig(
                system_instruction=AGENTS["Architect"]
            )
        )
        architect_plan = architect_response.text
        print(f"\n{architect_plan}\n")
    except Exception as e:
        print(f"[ERROR] Architect failed: {str(e)}")
        sys.exit(1)
    
    specialists = ["Geometry_Engineer", "Frontend_Specialist", "Backend_DB_Specialist", "QA_Automation"]
    combined_output = "ARCHITECT'S MASTER PLAN:\n" + architect_plan + "\n\n--- SPECIALIST DELIVERABLES ---\n"
    
    for specialist_name in specialists:
        print("========================================")
        print(f"HANDING OFF TO: @{specialist_name.replace('_', '-')}")
        print("========================================")
        
        prompt = (
            f"Here is the user's original task: '{user_prompt}'\n"
            f"Here is the Architect's Master Plan:\n{architect_plan}\n\n"
            f"As the {specialist_name}, please execute and provide your specific deliverables based ONLY on your area of expertise. "
            "Write the actual code, schema, or test plan requested."
        )
        
        try:
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=AGENTS[specialist_name]
                )
            )
            specialist_output = response.text
            print(f"\n{specialist_output}\n")
            combined_output += f"\n## [{specialist_name.replace('_', ' ')}]\n{specialist_output}\n"
        except Exception as e:
            print(f"\n[ERROR] The {specialist_name} encountered an issue: {str(e)}\n")

    output_file = "latest_deliverable.md"
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(combined_output)
        
    print("========================================")
    print(f"[SUCCESS] TASK COMPLETE! All agent outputs saved to: {output_file}")
    print("========================================")

if __name__ == "__main__":
    main()
