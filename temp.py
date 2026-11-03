
import os
from dotenv import load_dotenv
from groq import Groq

# Load variables from .env
load_dotenv()

# Initialize Groq
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# List available models
models = client.models.list()

for model in models.data:
    print(model.id)
