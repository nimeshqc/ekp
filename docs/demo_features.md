
# Purpose

- Prepare the Demo platform to be used in upwork project/job proposal to win the bid of the project.
- The project category that we are targetting is - Data processing/vectorisation, Ingestion of embeddings, RAG, Chatbot over knowledge-base, etc.


**Platform Name : Enterprise Knowledge Platform**

# Demo Features

1. **Ingestion**
   - Upload docs: pdf(Only text, no table, no image, no OCR), txt, md, docx (only text, no image, no table, no video)
   - Max 5 docs, max size 25 MB

2. **RAG (Retrieval-Augmented Generation)**
   - Query & Response

3. **2 Options to User for Query/RAG**
   - Try with own docs (client's docs)
   - OR
   - Try with pre-ingested default docs (our docs)

4. **Proposal specific URL generation**
   - With request limit, time limit (expiry) of URL (like Presigned URL)
   - admin should be able to generate this URL.
   - Admin would set the limit for max ingestion and RAQ query for each URL(i.e. Each proposal) to prevent misuse of URL.

5. **Highlight the source text**
   - Highlight the source text after opening the source file.

6. **Show Stats like:**
   - **Ingestion stats:**
     - Latency
     - Total embeddings created
     - Total tokens generated
     - many others
   - **RAG:**
     - LLM input token, output token, latency
     - many others

7. **Response should include:**
   - Answer to the question
   - Ref to source files
   - Clickable sources with highlight of text after opening this source file in new tab
   - Follow-up questions (3)
   - other deails, if required
   - Streaming of the response.

8. **Showcase processing action**
   - In both Ingestion & RAG, UI should show the actions like - chunking, embedding, etc.

9. **Like/Dislike on Response (Answer)**

10. **Admin portal**
   - generate Client URL for demo/proposal.
   - Tracking of each Ingestion and RAG query in Admin Dashboard


## Keep in Mind

- Embedding model should be deployed and used in house, no use of external embeddng api.
- LLM should be used from external API, like Gemini.
- Suggested to use langchain library for this.
- backend in python.

- Hardware resource constraints : 2 vCPU, 4 GB RAM 80 GB SSD
