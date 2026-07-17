'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { useUploadWizardStore } from '@/lib/stores/uploadWizardStore'
import { createClient } from '@/lib/supabase/client'
import { ContractTypeSelect } from './ContractTypeSelect'
import { FileDropzone } from './FileDropzone'
import { ProcessingProgress } from './ProcessingProgress'
import { TermPreviewList } from './TermPreviewList'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { toast } from '@/lib/stores/toastStore'

interface UploadResponse {
  contract_id: string
  status: string
  page_count: number
  token_count: number
  storage_warning: string | null
}

interface ProcessResponse {
  status: string
  detected_contract_type: 'NDA' | 'MSA'
  key_terms: unknown[]
  custom_key_terms: unknown[]
}

interface FunctionErrorBody {
  error: string
  message: string
}

async function readFunctionsError(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const body = (await error.context.json().catch(() => null)) as FunctionErrorBody | null
    return body?.message ?? fallback
  }
  return 'Could not reach the server. Check your connection and try again.'
}

export function UploadWizard() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [uploadedContractId, setUploadedContractId] = useState<string | null>(null)
  const {
    step,
    contractType,
    selectedFile,
    customTerms,
    setStep,
    setContractType,
    setSelectedFile,
    addCustomTerm,
    removeCustomTerm,
  } = useUploadWizardStore()

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!contractType || !selectedFile) throw new Error('Missing contract type or file.')

      const supabase = createClient()
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('contract_type', contractType)
      formData.append('filename', selectedFile.name)

      const { data, error } = await supabase.functions.invoke<UploadResponse>('upload-extract-text', {
        body: formData,
      })

      if (error) throw new Error(await readFunctionsError(error, 'Upload failed. Please try again.'))
      if (!data) throw new Error('Upload failed. Please try again.')
      return data
    },
    onSuccess: (data) => {
      setUploadedContractId(data.contract_id)
      setStep('preview')
      if (data.storage_warning) toast.error(data.storage_warning)
    },
  })

  const processMutation = useMutation({
    mutationFn: async () => {
      if (!uploadedContractId || !contractType) throw new Error('Missing contract.')

      const supabase = createClient()
      const { data, error } = await supabase.functions.invoke<ProcessResponse>('process-contract', {
        body: { contract_id: uploadedContractId, contract_type: contractType, custom_terms: customTerms },
      })

      if (error) throw new Error(await readFunctionsError(error, "We couldn't process this contract. Please try again."))
      if (!data) throw new Error("We couldn't process this contract. Please try again.")
      return data
    },
    onSuccess: (processData) => {
      queryClient.setQueryData(['contract', uploadedContractId], processData)
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
      router.push('/dashboard')
    },
  })

  if (uploadMutation.isPending) {
    return (
      <div className="flex flex-col gap-lg">
        <ProcessingProgress currentStep={1} />
      </div>
    )
  }

  if (processMutation.isPending) {
    return (
      <div className="flex flex-col gap-lg">
        <ProcessingProgress currentStep={2} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-lg">
      {step === 'select-type' && (
        <>
          <ContractTypeSelect value={contractType} onChange={setContractType} />
          <Button disabled={!contractType} onClick={() => setStep('upload')} className="self-end">
            Continue
          </Button>
        </>
      )}

      {step === 'upload' && (
        <>
          <FileDropzone selectedFile={selectedFile} onFileSelect={setSelectedFile} />

          {uploadMutation.isError && <Alert variant="error">{uploadMutation.error.message}</Alert>}

          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep('select-type')}>
              Back
            </Button>
            <Button disabled={!selectedFile} onClick={() => uploadMutation.mutate()}>
              Upload contract
            </Button>
          </div>
        </>
      )}

      {step === 'preview' && contractType && (
        <>
          <TermPreviewList
            contractType={contractType}
            customTerms={customTerms}
            onAddCustomTerm={addCustomTerm}
            onRemoveCustomTerm={removeCustomTerm}
          />

          {processMutation.isError && <Alert variant="error">{processMutation.error.message}</Alert>}

          <div className="flex justify-end">
            <Button onClick={() => processMutation.mutate()}>Process Contract</Button>
          </div>
        </>
      )}
    </div>
  )
}
