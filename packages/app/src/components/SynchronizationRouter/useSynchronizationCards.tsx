/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
import { IModelGrid } from "@itwin/imodel-browser-react";
import { SvgPlay, SvgSync } from "@itwin/itwinui-icons-react";
import {
  Body,
  IconButton,
  ProgressRadial,
  Tag,
  TagContainer,
  toaster,
} from "@itwin/itwinui-react";
import classnames from "classnames";
import React, { ComponentPropsWithoutRef } from "react";

import {
  ExecutionResult,
  ExecutionState,
} from "../../api/synchronization/generated";
import { SynchronizationClient } from "../../api/synchronization/synchronizationClient";
import { useApiPrefix } from "../../api/useApiPrefix";
import { DetailedStatus } from "./components/DetailedStatus";
import { TileDropTarget } from "./components/TileDropTarget";
import { useSynchronizeFileUploader } from "./useSynchronizeFileUploader";
import { interpretRunInfo, useSynchronizeInfo } from "./useSynchronizeInfo";

type UseIndividualState = ComponentPropsWithoutRef<
  typeof IModelGrid
>["useIndividualState"];

export const SynchronizationCardContext = React.createContext<{
  email?: string;
}>({});

const getProgressStatus = (state = "") =>
  (({
    Success: "positive",
    Error: "negative",
  } as {
    [state: string]: ComponentPropsWithoutRef<typeof ProgressRadial>["status"];
  })[state]);

/**
 * Adds the ability to see synchronization details and add upload drop target handling.
 * use as useIndividualState parameter in IModelGrid
 */
export const useSynchronizationCards: UseIndividualState = (
  { id: iModelId, projectId, ...iModel },
  { accessToken = "" }
) => {
  const { email = "" } = React.useContext(SynchronizationCardContext);

  const [active, setActive] = React.useState(false);

  const ref = React.useRef<HTMLDivElement | null>(null);
  const {
    progress,
    step,
    state,
    status,
    uploadFiles,
    resetUploader,
  } = useSynchronizeFileUploader({
    accessToken: accessToken ?? "",
    iModelId: iModelId,
    projectId: projectId ?? "",
    email,
  });

  const {
    connection,
    sourceFiles,
    fetchSources,
    lastRunResults,
  } = useSynchronizeInfo(iModelId, accessToken);

  React.useEffect(() => void fetchSources(), [fetchSources]);

  const urlPrefix = useApiPrefix();

  const connectionId = connection?.id;
  const runConnection = React.useCallback(async () => {
    if (!iModelId || !connectionId) {
      return;
    }
    const client = new SynchronizationClient(urlPrefix, accessToken);
    await client.runConnection(iModelId, connectionId);
    void fetchSources();
  }, [accessToken, connectionId, fetchSources, iModelId, urlPrefix]);

  const lastRunId = lastRunResults?.id;
  const [preUploadRunId, setPreUploadRunId] = React.useState(lastRunId);
  React.useEffect(() => {
    if (preUploadRunId !== lastRunId) {
      resetUploader();
      setPreUploadRunId(lastRunId);
    }
  }, [lastRunId, preUploadRunId, resetUploader]);

  const [count, setCount] = React.useState<string | undefined>("--");
  React.useEffect(() => {
    if (typeof sourceFiles?.length !== "undefined") {
      setCount(sourceFiles.length > 99 ? "99+" : `${sourceFiles.length}`);
    }
  }, [sourceFiles]);

  const [connectionStatus, setConnectionStatus] = React.useState<
    React.ReactNode
  >();

  React.useEffect(() => {
    if (state) {
      setConnectionStatus(
        <DetailedStatus
          text={status && state === "Working" ? status : state}
          status={getProgressStatus(state)}
          altIcon={state ? undefined : <></>}
          progress={step === 3 ? progress : undefined}
        />
      );
    } else if (lastRunResults) {
      if (
        lastRunResults.state === ExecutionState.Completed &&
        lastRunResults.result !== ExecutionResult.Error &&
        sourceFiles?.some(
          (_, index) =>
            !SynchronizationClient.getTaskInfoFromRun(
              lastRunResults,
              sourceFiles,
              index
            )
        )
      ) {
        setConnectionStatus(
          <DetailedStatus
            text={"Ready to synchronize"}
            altIcon={
              count !== "0" && (
                <IconButton
                  styleType={"borderless"}
                  size={"small"}
                  onClick={runConnection}
                >
                  <SvgPlay />
                </IconButton>
              )
            }
          />
        );
      } else {
        const runInfo = interpretRunInfo(lastRunResults);
        setConnectionStatus(
          <DetailedStatus
            text={runInfo.time + runInfo.status}
            altIcon={runInfo.icon}
          />
        );
      }
    } else {
      setConnectionStatus(
        !sourceFiles ? (
          <Body isSkeleton={true}>Fetching...</Body>
        ) : (
          <DetailedStatus
            text={
              count === "0"
                ? "Empty ? Drag a file here to start!"
                : "Ready to synchronize"
            }
            altIcon={
              count !== "0" && (
                <IconButton
                  styleType={"borderless"}
                  size={"small"}
                  onClick={runConnection}
                >
                  <SvgPlay />
                </IconButton>
              )
            }
          />
        )
      );
    }
  }, [
    count,
    fetchSources,
    lastRunResults,
    progress,
    runConnection,
    sourceFiles,
    state,
    status,
    step,
  ]);

  React.useEffect(() => {
    if (state === "Error") {
      toaster.negative(`Upload to "${iModel.displayName}" failed: ${status}`, {
        type: "persisting",
        hasCloseButton: true,
      });
    }
  }, [iModel.displayName, state, status]);

  return {
    tileProps: {
      onDragOver: (e: any) => {
        e.stopPropagation();
        e.preventDefault();
      },
      onDragEnter: (e: any) => {
        e.stopPropagation();
        e.preventDefault();
        // only set active if a file is dragged over
        if (!active && e.dataTransfer?.items?.[0]?.kind === "file") {
          setActive(true);
          ref.current = e.target as HTMLDivElement;
        }
      },
      onDragLeave: (e: any) => {
        e.stopPropagation();
        e.preventDefault();
        // only set inactive if secondary target is outside the component
        if (active && !ref.current?.contains(e.target)) {
          setActive(false);
        }
      },
      onDrop: (e: any) => {
        e.preventDefault();
        e.stopPropagation();
        if (active) {
          setActive(false);
          if (state !== "Working") {
            void uploadFiles(e?.dataTransfer?.files, () => {
              void fetchSources();
            });
          }
        }
      },
      metadata: (
        <>
          <SvgSync />
          <TagContainer>
            <Tag variant={"basic"}>{count}</Tag>
          </TagContainer>
        </>
      ),
      className: classnames("tile-with-status", active && "hollow-shell"),
      children: (
        <div className={"tile-status"}>
          {connectionStatus}
          {active && <TileDropTarget isDisabled={state === "Working"} />}
        </div>
      ),
    },
  } as any;
};
