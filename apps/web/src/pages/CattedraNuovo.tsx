import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateMaterial, getListMaterialsQueryKey, useListClasses } from "@sillabo/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpload } from "@/hooks/use-upload";
import { TeacherLayout } from "@/components/TeacherLayout";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Loader2, FileUp, FileText, X } from "lucide-react";
import { Link } from "wouter";

const ACCEPTED_EXTENSIONS = [".pdf", ".doc", ".docx"];

const schema = z
  .object({
    title: z.string().min(1, "Il titolo è obbligatorio"),
    subject: z.string().min(1, "La materia è obbligatoria"),
    gradeLevel: z.string().min(1, "La classe è obbligatoria"),
    content: z.string().default(""),
    fileUrl: z.string().optional(),
    fileName: z.string().optional(),
    classIds: z.array(z.string()).default([]),
  })
  .refine((data) => data.content.trim().length >= 10 || !!data.fileUrl, {
    message: "Carica un file (PDF/Word) o incolla il contenuto del materiale (almeno 10 caratteri)",
    path: ["content"],
  });

export default function CattedraNuovo() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createMaterial = useCreateMaterial();
  const { data: classes } = useListClasses();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      subject: "",
      gradeLevel: "",
      content: "",
      fileUrl: "",
      fileName: "",
      classIds: [],
    },
  });

  const { uploadFile, isUploading, error: uploadError } = useUpload({
    onSuccess: (response) => {
      form.setValue("fileUrl", response.objectPath);
      form.setValue("fileName", response.metadata.name);
      form.clearErrors("content");
    },
  });

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
      toast({
        title: "Formato non supportato",
        description: "Sono ammessi solo file PDF e Word (.pdf, .doc, .docx).",
        variant: "destructive",
      });
      e.target.value = "";
      return;
    }

    await uploadFile(file);
    e.target.value = "";
  }

  function removeFile() {
    form.setValue("fileUrl", "");
    form.setValue("fileName", "");
  }

  useEffect(() => {
    if (classes?.length && form.getValues("classIds").length === 0) {
      form.setValue("classIds", [String(classes[0].id)]);
    }
  }, [classes]);

  function onSubmit(values: z.infer<typeof schema>) {
    const { classIds, fileUrl, fileName, ...rest } = values;
    createMaterial.mutate(
      {
        data: {
          ...rest,
          fileUrl: fileUrl || undefined,
          fileName: fileName || undefined,
          classIds: classIds.map((id) => parseInt(id)),
        },
      },
      {
        onSuccess: () => {
          toast({
            title: "Materiale caricato con successo",
            description: "Il materiale è ora disponibile per gli studenti.",
          });
          queryClient.invalidateQueries({ queryKey: getListMaterialsQueryKey() });
          setLocation("/cattedra");
        },
        onError: (err: any) => {
          toast({
            title: "Errore",
            description: err?.response?.data?.error ?? "Si è verificato un errore durante il caricamento.",
            variant: "destructive",
          });
        },
      },
    );
  }

  return (
    <TeacherLayout>
      <div className="p-8 max-w-4xl mx-auto space-y-8">
        <div>
          <Button variant="ghost" asChild className="mb-4 -ml-4 text-muted-foreground">
            <Link href="/cattedra">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Torna alla dashboard
            </Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Nuovo Materiale</h1>
          <p className="text-muted-foreground mt-1">Carica un nuovo testo, Sillabo genererà automaticamente quiz e simulazioni.</p>
        </div>

        <div className="bg-card border rounded-xl p-6 shadow-sm">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Titolo dell'argomento</FormLabel>
                      <FormControl>
                        <Input placeholder="es. La Rivoluzione Francese" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="subject"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Materia</FormLabel>
                      <FormControl>
                        <Input placeholder="es. Storia" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="gradeLevel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Classe</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleziona la classe" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="1^ Superiore">1ª Superiore</SelectItem>
                          <SelectItem value="2^ Superiore">2ª Superiore</SelectItem>
                          <SelectItem value="3^ Superiore">3ª Superiore</SelectItem>
                          <SelectItem value="4^ Superiore">4ª Superiore</SelectItem>
                          <SelectItem value="5^ Superiore">5ª Superiore</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="classIds"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Assegna alle classi</FormLabel>
                      <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-md border p-3">
                        {classes?.length ? (
                          classes.map((c) => {
                            const value = String(c.id);
                            const checked = field.value.includes(value);
                            return (
                              <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(isChecked) => {
                                    field.onChange(
                                      isChecked
                                        ? [...field.value, value]
                                        : field.value.filter((v) => v !== value),
                                    );
                                  }}
                                />
                                {c.name} — {c.gradeLevel}
                              </label>
                            );
                          })
                        ) : (
                          <p className="text-sm text-muted-foreground">Nessuna classe disponibile</p>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Puoi assegnare lo stesso materiale a più classi contemporaneamente (es. sezioni parallele). Se non selezioni nessuna classe, il materiale resterà personale e non comparirà nelle statistiche dell'istituto.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="fileUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Carica il materiale (PDF o Word)</FormLabel>
                    <FormControl>
                      <div>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          className="hidden"
                          onChange={handleFileChange}
                          disabled={isUploading}
                        />
                        {field.value ? (
                          <div className="flex items-center justify-between gap-3 rounded-md border p-3 bg-muted/40">
                            <div className="flex items-center gap-2 text-sm min-w-0">
                              <FileText className="h-4 w-4 shrink-0 text-primary" />
                              <span className="truncate">{form.watch("fileName")}</span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={removeFile}
                              disabled={isUploading}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                            className="w-full"
                          >
                            {isUploading ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Caricamento in corso...
                              </>
                            ) : (
                              <>
                                <FileUp className="mr-2 h-4 w-4" />
                                Seleziona un file PDF o Word (es. e-book del libro di testo)
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </FormControl>
                    {uploadError && (
                      <p className="text-sm text-destructive">{uploadError.message}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Sillabo estrarrà automaticamente il testo dal file per generare quiz e simulazioni.
                    </p>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Oppure incolla il testo della lezione</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Incolla qui il testo da studiare (facoltativo se hai caricato un file)..."
                        className="min-h-[200px] resize-y"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={createMaterial.isPending || isUploading}>
                  {createMaterial.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Elaborazione in corso...
                    </>
                  ) : (
                    "Salva e Procedi"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </TeacherLayout>
  );
}
